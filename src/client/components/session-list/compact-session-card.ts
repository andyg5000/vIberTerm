/**
 * Compact Session Card Component
 *
 * A compact list item representation of a session for sidebar/compact views.
 * Handles different session states (running, exited) with appropriate styling.
 *
 * @fires session-select - When card is clicked (detail: Session)
 * @fires session-rename - When session is renamed (detail: { sessionId: string, newName: string })
 * @fires session-delete - When session delete is requested (detail: { sessionId: string })
 * @fires session-cleanup - When exited session cleanup is requested (detail: { sessionId: string })
 */
import type { PropertyValues } from 'lit';
import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TmuxWindow } from '../../../shared/multiplexer-types.js';
import type { Session } from '../../../shared/types.js';
import { formatSessionDuration } from '../../../shared/utils/time.js';
import { apiClient } from '../../services/api-client.js';
import type { AuthClient } from '../../services/auth-client.js';
import { sessionActionService } from '../../services/session-action-service.js';
import { formatPathForDisplay } from '../../utils/path-utils.js';
import '../inline-edit.js';
import '../confirm-dialog.js';

@customElement('compact-session-card')
export class CompactSessionCard extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Object }) session!: Session;
  @property({ type: Object }) authClient!: AuthClient;
  @property({ type: Boolean }) selected = false;
  @property({ type: String }) sessionType: 'running' | 'exited' | 'parked' = 'running';
  @property({ type: Number }) sessionNumber?: number;
  @state() private showKillConfirm = false;
  @state() private parking = false;
  @state() private resuming = false;
  @state() private tmuxWindows: TmuxWindow[] = [];
  private tmuxPollInterval?: ReturnType<typeof setInterval>;

  connectedCallback() {
    super.connectedCallback();
    if (this.isTmuxSession() && this.session.status === 'running') {
      this.loadTmuxWindows();
      this.tmuxPollInterval = setInterval(() => this.loadTmuxWindows(), 5000);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.tmuxPollInterval) {
      clearInterval(this.tmuxPollInterval);
    }
  }

  protected updated(changedProps: PropertyValues) {
    if (changedProps.has('session')) {
      const oldSession = changedProps.get('session') as Session | undefined;
      if (oldSession?.id !== this.session?.id) {
        // Session changed, reset windows and restart polling
        this.tmuxWindows = [];
        if (this.tmuxPollInterval) {
          clearInterval(this.tmuxPollInterval);
          this.tmuxPollInterval = undefined;
        }
        if (this.isTmuxSession() && this.session.status === 'running') {
          this.loadTmuxWindows();
          this.tmuxPollInterval = setInterval(() => this.loadTmuxWindows(), 5000);
        }
      }
    }
  }

  private getTmuxName(): string | null {
    const name = this.session?.name;
    if (!name?.startsWith('tmux:')) return null;
    const tmuxPart = name.slice(5).trim();
    return tmuxPart.split(':')[0] || null;
  }

  private async loadTmuxWindows() {
    const tmuxName = this.getTmuxName();
    if (!tmuxName) return;
    try {
      const response = await apiClient.get<{ windows: TmuxWindow[] }>(
        `/multiplexer/tmux/sessions/${encodeURIComponent(tmuxName)}/windows`
      );
      this.tmuxWindows = response.windows || [];
    } catch {
      // Silently fail — windows are non-critical
    }
  }

  private async handleWindowClick(e: Event, windowIndex: number) {
    e.stopPropagation();
    const tmuxName = this.getTmuxName();
    if (!tmuxName) return;

    try {
      const response = await apiClient.post<{
        success: boolean;
        sessionId?: string;
      }>('/multiplexer/attach', {
        type: 'tmux',
        sessionName: tmuxName,
        windowIndex,
        cols: 120,
        rows: 30,
        titleMode: 'static',
      });

      if (response.success && response.sessionId) {
        // Optimistically update active window
        this.tmuxWindows = this.tmuxWindows.map((w) => ({
          ...w,
          active: w.index === windowIndex,
        }));
        this.dispatchEvent(
          new CustomEvent('session-select', {
            detail: { ...this.session, id: response.sessionId },
            bubbles: true,
            composed: true,
          })
        );
      }
    } catch (error) {
      console.error('Failed to switch tmux window:', error);
    }
  }

  private handleClick() {
    this.dispatchEvent(
      new CustomEvent('session-select', {
        detail: this.session,
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleRename(newName: string) {
    this.dispatchEvent(
      new CustomEvent('session-rename', {
        detail: { sessionId: this.session.id, newName },
        bubbles: true,
        composed: true,
      })
    );
  }

  private async handlePark(e: Event) {
    e.stopPropagation();
    if (this.parking || this.session.status !== 'running') return;

    this.parking = true;
    const result = await sessionActionService.parkSession(this.session, {
      authClient: this.authClient,
      callbacks: {
        onError: () => {
          this.parking = false;
        },
      },
    });

    if (result.success) {
      this.dispatchEvent(
        new CustomEvent('session-parked', {
          detail: { sessionId: this.session.id },
          bubbles: true,
          composed: true,
        })
      );
    }
    this.parking = false;
  }

  private async handleResume(e: Event) {
    e.stopPropagation();
    if (this.resuming || this.session.status !== 'parked') return;

    this.resuming = true;
    const result = await sessionActionService.resumeSession(this.session, {
      authClient: this.authClient,
      callbacks: {
        onError: () => {
          this.resuming = false;
        },
      },
    });

    if (result.success) {
      // Dispatch immediately, then again after delays to catch server state updates
      const fireRefresh = () =>
        this.dispatchEvent(
          new CustomEvent('session-resumed', {
            detail: { sessionId: this.session.id },
            bubbles: true,
            composed: true,
          })
        );
      fireRefresh();
      setTimeout(fireRefresh, 1000);
      setTimeout(fireRefresh, 3000);
    }
    this.resuming = false;
  }

  private async handleDelete(e: Event) {
    e.stopPropagation();

    if (this.session.status === 'running') {
      this.showKillConfirm = true;
      return;
    }

    await this.performDelete();
  }

  private async performDelete() {
    // Use sessionActionService to perform the actual kill/cleanup
    await sessionActionService.deleteSession(this.session, {
      authClient: this.authClient,
      callbacks: {
        onSuccess: () => {
          // Only dispatch the event after successful server-side deletion
          const eventType = this.session.status === 'exited' ? 'session-cleanup' : 'session-delete';
          this.dispatchEvent(
            new CustomEvent(eventType, {
              detail: { sessionId: this.session.id },
              bubbles: true,
              composed: true,
            })
          );
        },
        onError: (error: string) => {
          console.error('Failed to delete session:', error);
          // Dispatch error event
          this.dispatchEvent(
            new CustomEvent('session-kill-error', {
              detail: { sessionId: this.session.id, error },
              bubbles: true,
              composed: true,
            })
          );
        },
      },
    });
  }

  private renderStatusIndicator() {
    const session = this.session;

    if (session.status === 'exited') {
      return html`<div class="w-2.5 h-2.5 rounded-full bg-status-warning"></div>`;
    }

    if (session.status === 'parked') {
      return html`<div class="w-2.5 h-2.5 rounded-full bg-blue-400"></div>`;
    }

    return html`<div class="w-2.5 h-2.5 rounded-full bg-status-success"></div>`;
  }

  private renderGitChanges() {
    if (!this.session.gitRepoPath) return '';

    const changes = [];

    // Show uncommitted changes indicator first
    if (this.session.gitHasChanges) {
      changes.push(html`<span class="text-status-warning ml-1">●</span>`);
    }

    // Show ahead/behind counts
    if (this.session.gitAheadCount && this.session.gitAheadCount > 0) {
      changes.push(
        html`<span class="text-status-success ml-1">↑${this.session.gitAheadCount}</span>`
      );
    }
    if (this.session.gitBehindCount && this.session.gitBehindCount > 0) {
      changes.push(
        html`<span class="text-status-warning ml-1">↓${this.session.gitBehindCount}</span>`
      );
    }

    if (changes.length === 0) return '';

    return html`${changes}`;
  }

  private isTmuxSession(): boolean {
    const cmd = this.session.command;
    return Array.isArray(cmd) && cmd[0] === 'tmux' && cmd[1] === 'attach-session';
  }

  private renderSessionName() {
    const displayName =
      this.session.name ||
      (Array.isArray(this.session.command) ? this.session.command.join(' ') : this.session.command);

    const tmuxBadge = this.isTmuxSession()
      ? html`<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 ml-1.5 align-middle">tmux</span>`
      : '';

    // Only show inline-edit for running sessions
    if (this.sessionType !== 'exited') {
      return html`
        <inline-edit
          .value=${displayName}
          .placeholder=${Array.isArray(this.session.command) ? this.session.command.join(' ') : this.session.command}
          .onSave=${(newName: string) => this.handleRename(newName)}
        ></inline-edit>${tmuxBadge}
      `;
    }

    // For exited sessions, just show the name
    return html`<span title="${displayName}">${displayName}</span>${tmuxBadge}`;
  }

  private renderParkResumeButton() {
    if (this.session.status === 'running') {
      return html`
        <button
          class="btn-ghost text-blue-400 p-1.5 rounded-md transition-all hover:bg-blue-400/20 hover:shadow-sm"
          @click=${this.handlePark}
          ?disabled=${this.parking}
          title="Park session"
          data-testid="compact-park-button"
        >
          ${
            this.parking
              ? html`<span class="block w-4 h-4 animate-spin">⠋</span>`
              : html`
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              `
          }
        </button>
      `;
    }

    if (this.session.status === 'parked') {
      return html`
        <button
          class="btn-ghost text-status-success p-1.5 rounded-md transition-all hover:bg-status-success/20 hover:shadow-sm"
          @click=${this.handleResume}
          ?disabled=${this.resuming}
          title="Resume session"
          data-testid="compact-resume-button"
        >
          ${
            this.resuming
              ? html`<span class="block w-4 h-4 animate-spin">⠋</span>`
              : html`
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              `
          }
        </button>
      `;
    }

    return '';
  }

  private renderDeleteButton() {
    const isExited = this.session.status === 'exited';

    // Unified button styling with proper hover states
    const buttonClass = isExited
      ? 'btn-ghost text-text-muted p-1.5 rounded-md transition-all hover:text-status-warning hover:bg-bg-elevated hover:shadow-sm'
      : 'btn-ghost text-text-muted p-1.5 rounded-md transition-all hover:text-status-error hover:bg-bg-elevated hover:shadow-sm hover:scale-110';

    const buttonTitle = isExited ? 'Clean up session' : 'Kill Session';

    return html`
      <button
        class="${buttonClass}"
        @click=${this.handleDelete}
        title="${buttonTitle}"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;
  }

  render() {
    const session = this.session;
    const isExited = session.status === 'exited';
    const isTouchDevice = 'ontouchstart' in window;

    // Base classes for the card
    const cardClasses = [
      'group',
      'flex',
      'items-center',
      'gap-3',
      'p-3',
      'rounded-lg',
      'cursor-pointer',
      this.selected
        ? 'bg-bg-elevated border border-accent-primary shadow-card-hover'
        : isExited
          ? 'bg-bg-secondary border border-border hover:bg-bg-tertiary hover:border-border-light hover:shadow-card opacity-75'
          : 'bg-bg-secondary border border-border hover:bg-bg-tertiary hover:border-border-light hover:shadow-card',
    ].join(' ');

    // Text color classes
    const nameColorClass = this.selected
      ? 'text-accent-primary font-medium'
      : isExited
        ? 'text-text-muted group-hover:text-text transition-colors'
        : 'text-text group-hover:text-accent-primary transition-colors';

    const pathColorClass = isExited ? 'text-text-dim' : 'text-text-muted';

    return html`
      <div class="${cardClasses}" style="margin-bottom: 12px;" @click=${this.handleClick}>
        <!-- Session number and status indicator -->
        <div class="flex items-center gap-2 flex-shrink-0">
          ${
            this.sessionNumber
              ? html`
            <span class="text-xs font-mono ${this.selected ? 'text-accent-primary' : 'text-text-muted'} min-w-[1.5rem] text-center">
              ${this.sessionNumber}
            </span>
          `
              : ''
          }
          <div class="relative">
            ${this.renderStatusIndicator()}
          </div>
        </div>
        
        <!-- Elegant divider line -->
        <div class="w-px h-full self-stretch bg-gradient-to-b from-transparent via-border to-transparent"></div>
        
        <!-- Session content -->
        <div class="flex-1 min-w-0">
          <!-- Row 1: Session name -->
          <div class="text-sm font-mono truncate ${nameColorClass}">
            ${this.renderSessionName()}
          </div>
          
          <!-- Row 2: Path, branch, and git changes -->
          <div class="text-xs ${pathColorClass} truncate flex items-center gap-1 mt-1">
            <span class="truncate">${formatPathForDisplay(session.workingDir)}</span>
            ${
              session.gitBranch
                ? html`
                  <span class="text-text-muted/50">·</span>
                  <span class="text-status-success font-mono">[${session.gitBranch}]</span>
                  ${session.gitIsWorktree ? html`<span class="text-purple-400 ml-0.5">⎇</span>` : ''}
                  <!-- Git changes indicator after branch -->
                  ${this.renderGitChanges()}
                `
                : ''
            }
          </div>
          
          <!-- Row 3: Tmux window tabs -->
          ${
            this.tmuxWindows.length > 0
              ? html`
            <div class="flex flex-wrap gap-1 mt-1.5">
              ${this.tmuxWindows.map(
                (win) => html`
                  <button
                    class="text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all
                      ${
                        win.active
                          ? 'bg-accent-primary/20 border-accent-primary/50 text-accent-primary'
                          : 'bg-bg-tertiary border-border text-text-muted hover:bg-bg-elevated hover:text-text hover:border-border-light'
                      }"
                    title="${win.name}"
                    @click=${(e: Event) => this.handleWindowClick(e, win.index)}
                  >${win.index}:${win.name}</button>
                `
              )}
            </div>
          `
              : ''
          }
        </div>
        
        <!-- Right side: duration and close button -->
        <div class="relative flex items-center flex-shrink-0 gap-1">
          ${
            isTouchDevice
              ? html`
                <!-- Touch devices: Action buttons left of time -->
                ${this.renderParkResumeButton()}
                ${this.renderDeleteButton()}
                <div class="text-xs text-text-${isExited ? 'dim' : 'muted'} font-mono">
                  ${session.startedAt ? formatSessionDuration(session.startedAt, session.status === 'exited' ? session.lastModified : undefined) : ''}
                </div>
              `
              : html`
                <!-- Desktop: Time that hides on hover -->
                <div class="text-xs text-text-${isExited ? 'dim' : 'muted'} font-mono transition-opacity group-hover:opacity-0">
                  ${session.startedAt ? formatSessionDuration(session.startedAt, session.status === 'exited' ? session.lastModified : undefined) : ''}
                </div>
                
                <!-- Desktop: Buttons show on hover -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-0">
                  ${this.renderParkResumeButton()}
                  ${this.renderDeleteButton()}
                </div>
              `
          }
        </div>

      </div>

      <confirm-dialog
        .visible=${this.showKillConfirm}
        .dialogTitle=${'Kill Session'}
        .message=${'This session is still running. Are you sure you want to kill it?'}
        .confirmLabel=${'Kill'}
        .danger=${true}
        @confirm=${async () => {
          this.showKillConfirm = false;
          await this.performDelete();
        }}
        @cancel=${() => {
          this.showKillConfirm = false;
        }}
      ></confirm-dialog>
    `;
  }
}
