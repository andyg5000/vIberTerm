/**
 * Session Header Component
 *
 * Header bar for session view with navigation, session info, status, and controls.
 * Includes back button, sidebar toggle, session details, and terminal controls.
 */
import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Session } from '../../../shared/types.js';
import '../clickable-path.js';
import '../inline-edit.js';
import '../notification-status.js';
import '../tmux-cheat-sheet.js';
import '../git-status-badge.js';
import { authClient } from '../../services/auth-client.js';
import { isAIAssistantSession, sendAIPrompt } from '../../utils/ai-sessions.js';
import { createLogger } from '../../utils/logger.js';
import './compact-menu.js';
import '../theme-toggle-icon.js';
import './image-upload-menu.js';
import './session-status-dropdown.js';

const logger = createLogger('session-header');

@customElement('session-header')
export class SessionHeader extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Object }) session: Session | null = null;
  @property({ type: Boolean }) showBackButton = true;
  @property({ type: Boolean }) showSidebarToggle = false;
  @property({ type: Boolean }) sidebarCollapsed = false;
  @property({ type: Number }) terminalMaxCols = 0;
  @property({ type: Number }) terminalFontSize = 14;
  @property({ type: String }) customWidth = '';
  @property({ type: Boolean }) showWidthSelector = false;
  @property({ type: String }) widthLabel = '';
  @property({ type: String }) widthTooltip = '';
  @property({ type: Function }) onBack?: () => void;
  @property({ type: Function }) onSidebarToggle?: () => void;
  @property({ type: Function }) onOpenFileBrowser?: () => void;
  @property({ type: Function }) onCreateSession?: () => void;
  @property({ type: Function }) onOpenImagePicker?: () => void;
  @property({ type: Function }) onMaxWidthToggle?: () => void;
  @property({ type: Function }) onWidthSelect?: (width: number) => void;
  @property({ type: Function }) onFontSizeChange?: (size: number) => void;
  @property({ type: Function }) onOpenSettings?: () => void;
  @property({ type: String }) currentTheme = 'system';
  @property({ type: Boolean }) isMobile = false;
  @property({ type: Boolean }) macAppConnected = false;
  @property({ type: Function }) onTerminateSession?: () => void;
  @property({ type: Function }) onClearSession?: () => void;
  @property({ type: Boolean }) hasGitRepo = false;
  @property({ type: String }) viewMode: 'terminal' | 'worktree' = 'terminal';
  @property({ type: Function }) onToggleViewMode?: () => void;
  @property({ type: Boolean }) chatMode = false;
  @property({ type: Function }) onToggleChatMode?: () => void;
  @property({ type: String }) tmuxStatus = '';
  @property({ type: Boolean }) mobileHeaderHidden = false;
  @state() private isHovered = false;
  @state() private useCompactMenu = false;
  @state() private mobileDrawerOpen = false;
  private resizeObserver?: ResizeObserver;

  connectedCallback() {
    super.connectedCallback();
    // Load saved theme preference
    const saved = localStorage.getItem('vibeterm-theme');
    this.currentTheme = (saved as 'light' | 'dark' | 'system') || 'system';

    // Setup resize observer for responsive button switching
    this.setupResizeObserver();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);
  }

  private setupResizeObserver() {
    // Observe the header container for size changes
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.checkButtonSpace(entry.contentRect.width);
      }
    });

    // Start observing after the element is rendered
    this.updateComplete.then(() => {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        const headerContainer = this.querySelector('.session-header-container');
        if (headerContainer) {
          this.resizeObserver?.observe(headerContainer);
          // Trigger initial check
          const width = headerContainer.clientWidth;
          this.checkButtonSpace(width);
        }
      });
    });
  }

  private checkButtonSpace(containerWidth: number) {
    // Calculate the minimum space needed for all individual buttons
    // Button widths (including padding):
    const imageUploadButton = 40;
    const themeToggleButton = 40;
    const settingsButton = 40;
    const widthSelectorButton = 120; // Wider due to text content (increased)
    const statusDropdownButton = 120; // Wider due to text content (increased)
    const buttonGap = 8;

    // Other elements:
    const cheatSheetWidth = this.isTmuxSession() ? 60 : 0; // Tmux cheat sheet icon
    const sessionInfoMinWidth = 300; // Minimum space for session name/path (increased)
    const sidebarToggleWidth = this.showSidebarToggle && this.sidebarCollapsed ? 56 : 0; // Including gap
    const padding = 48; // Container padding (increased)

    // Calculate total required width
    const buttonsWidth =
      imageUploadButton +
      themeToggleButton +
      settingsButton +
      widthSelectorButton +
      statusDropdownButton +
      buttonGap * 4;

    const requiredWidth =
      sessionInfoMinWidth + sidebarToggleWidth + cheatSheetWidth + buttonsWidth + padding;

    // Switch to compact menu more aggressively (larger buffer)
    const buffer = 150; // Increased buffer to account for sidebar
    const shouldUseCompact = containerWidth < requiredWidth + buffer;

    if (shouldUseCompact !== this.useCompactMenu) {
      this.useCompactMenu = shouldUseCompact;
      this.requestUpdate();
    }
  }

  private isTmuxSession(): boolean {
    return this.session?.name?.startsWith('tmux:') ?? false;
  }

  private getStatusText(): string {
    if (!this.session) return '';
    if ('active' in this.session && this.session.active === false) {
      return 'waiting';
    }
    return this.session.status;
  }

  private getStatusDotColor(): string {
    if (!this.session) return 'bg-bg-muted';
    if ('active' in this.session && this.session.active === false) {
      return 'bg-bg-muted';
    }
    return this.session.status === 'running' ? 'bg-status-success' : 'bg-status-warning';
  }

  render() {
    if (!this.session) return null;

    // Mobile compact header
    if (this.isMobile) {
      return this.renderMobileHeader();
    }

    return this.renderDesktopHeader();
  }

  private renderMobileHeader() {
    if (!this.session) return null;

    const sessionName =
      this.session.name ||
      (Array.isArray(this.session.command) ? this.session.command.join(' ') : this.session.command);

    return html`
      <style>
        .mobile-header-drawer {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.25s ease-out, opacity 0.2s ease-out;
          opacity: 0;
          will-change: max-height, opacity;
        }
        .mobile-header-drawer.open {
          max-height: 200px;
          opacity: 1;
        }
        #mobile-session-header {
          will-change: transform;
        }
      </style>
      <!-- Compact Mobile Header (44px) with auto-hide -->
      <div
        id="mobile-session-header"
        class="border-b border-border bg-bg-secondary session-header-container transition-transform duration-200 ease-out"
        style="padding-left: max(0.5rem, env(safe-area-inset-left)); padding-right: max(0.5rem, env(safe-area-inset-right)); ${this.mobileHeaderHidden ? 'transform: translateY(-100%); position: absolute; top: 0; left: 0; right: 0;' : ''}"
      >
        <div
          class="flex items-center justify-between h-11 px-1 gap-2"
          @click=${() => {
            this.mobileDrawerOpen = !this.mobileDrawerOpen;
          }}
        >
          <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <!-- Sidebar toggle -->
            ${
              this.showSidebarToggle && this.sidebarCollapsed
                ? html`
                  <button
                    class="bg-bg-tertiary border border-border rounded-md p-1.5 text-primary flex-shrink-0"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      this.onSidebarToggle?.();
                    }}
                    aria-label="Show sidebar"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/>
                    </svg>
                  </button>
                `
                : ''
            }

            <!-- Status dot -->
            <div class="relative flex-shrink-0">
              <div class="w-2 h-2 rounded-full ${this.getStatusDotColor()}"></div>
              ${
                this.getStatusText() === 'running'
                  ? html`<div class="absolute inset-0 w-2 h-2 rounded-full bg-status-success animate-ping opacity-50"></div>`
                  : ''
              }
            </div>

            <!-- Session name (truncated) -->
            <span class="text-text-bright text-xs font-medium truncate min-w-0 flex-1">
              ${sessionName}
            </span>

            <!-- Drawer indicator -->
            <svg
              width="12" height="12" viewBox="0 0 20 20" fill="currentColor"
              class="text-text-muted flex-shrink-0 transition-transform duration-200 ${this.mobileDrawerOpen ? 'rotate-180' : ''}"
            >
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </div>

          <!-- Right side: compact menu -->
          <div class="flex items-center gap-1 flex-shrink-0" @click=${(e: Event) => e.stopPropagation()}>
            <compact-menu
              .session=${this.session}
              .widthLabel=${this.widthLabel}
              .widthTooltip=${this.widthTooltip}
              .onOpenFileBrowser=${this.onOpenFileBrowser}
              .onUploadImage=${() => this.handleMobileUploadImage()}
              .onMaxWidthToggle=${this.onMaxWidthToggle}
              .onOpenSettings=${this.onOpenSettings}
              .onCreateSession=${this.onCreateSession}
              .currentTheme=${this.currentTheme}
              .macAppConnected=${this.macAppConnected}
              .onTerminateSession=${this.onTerminateSession}
              .onClearSession=${this.onClearSession}
              .hasGitRepo=${this.hasGitRepo}
              .viewMode=${this.viewMode}
              .onToggleViewMode=${() => this.dispatchEvent(new CustomEvent('toggle-view-mode'))}
              .chatMode=${this.chatMode}
              .onToggleChatMode=${this.onToggleChatMode}
              @theme-changed=${(e: CustomEvent) => {
                this.currentTheme = e.detail.theme;
              }}
            ></compact-menu>
          </div>
        </div>

        <!-- Expandable details drawer -->
        <div class="mobile-header-drawer ${this.mobileDrawerOpen ? 'open' : ''}">
          <div class="px-2 pb-2 pt-1 space-y-1.5">
            <!-- Working directory -->
            <div class="flex items-center gap-2 text-xs text-text-muted overflow-hidden">
              <clickable-path
                class="min-w-0 flex-1 truncate"
                .path=${this.session?.workingDir ?? ''}
                .iconSize=${11}
              ></clickable-path>
            </div>
            <!-- Git info -->
            ${
              this.session?.gitRepoPath
                ? html`
                  <div class="flex items-center gap-2">
                    <git-status-badge
                      class="min-w-0"
                      .session=${this.session}
                      .detailed=${true}
                    ></git-status-badge>
                  </div>
                `
                : ''
            }
            <!-- Editable session name -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-text-muted flex-shrink-0">Name:</span>
              <inline-edit
                class="min-w-0 flex-1 text-xs"
                .value=${this.session?.name || ''}
                .placeholder=${Array.isArray(this.session?.command) ? this.session?.command.join(' ') : this.session?.command ?? ''}
                .onSave=${(newName: string) => this.handleRename(newName)}
              ></inline-edit>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderDesktopHeader() {
    if (!this.session) return null;

    return html`
      <!-- Header content -->
      <div
        class="flex items-center justify-between border-b border-border text-sm min-w-0 max-w-[100vw] bg-bg-secondary px-4 py-2 session-header-container"
        style="padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right));"
      >
        <div class="flex items-center gap-3 min-w-0 flex-1 overflow-hidden flex-shrink">
          <!-- Sidebar Toggle (when sidebar is collapsed) -->
          ${
            this.showSidebarToggle && this.sidebarCollapsed
              ? html`
                <button
                  class="bg-bg-tertiary border border-border rounded-md p-2 text-primary transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                  @click=${() => this.onSidebarToggle?.()}
                  title="Show sidebar (⌘B)"
                  aria-label="Show sidebar"
                  aria-expanded="false"
                  aria-controls="sidebar"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/>
                  </svg>
                </button>

                <button
                  class="bg-bg-tertiary border border-border text-primary rounded-md p-2 transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                  @click=${() => {
                    window.location.href = '/';
                  }}
                  title="Go to root"
                  data-testid="go-to-root-button"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <rect x="3" y="3" width="6" height="6" rx="1.5" ry="1.5"/>
                    <rect x="11" y="3" width="6" height="6" rx="1.5" ry="1.5"/>
                    <rect x="3" y="11" width="6" height="6" rx="1.5" ry="1.5"/>
                    <rect x="11" y="11" width="6" height="6" rx="1.5" ry="1.5"/>
                  </svg>
                </button>

                <button
                  class="bg-bg-tertiary border border-border text-primary rounded-md p-2 transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                  @click=${() => this.onCreateSession?.()}
                  title="New Shell (no tmux) (⌘K)"
                  data-testid="create-session-button"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                  </svg>
                </button>
              `
              : ''
          }

          ${
            this.showBackButton
              ? html`
                <button
                  class="bg-bg-tertiary border border-border rounded-md px-3 py-1.5 font-mono text-xs text-primary transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                  @click=${() => this.onBack?.()}
                >
                  Back
                </button>
              `
              : ''
          }
          <div class="text-primary min-w-0 flex-1 overflow-hidden">
            <div class="text-bright font-medium text-xs sm:text-sm min-w-0 overflow-hidden">
              <div class="flex items-center gap-1 min-w-0 overflow-hidden" @mouseenter=${this.handleMouseEnter} @mouseleave=${this.handleMouseLeave}>
                <inline-edit
                  class="min-w-0 overflow-hidden block max-w-xs sm:max-w-md"
                  .value=${
                    this.session.name ||
                    (Array.isArray(this.session.command)
                      ? this.session.command.join(' ')
                      : this.session.command)
                  }
                  .placeholder=${
                    Array.isArray(this.session.command)
                      ? this.session.command.join(' ')
                      : this.session.command
                  }
                  .onSave=${(newName: string) => this.handleRename(newName)}
                ></inline-edit>
                ${
                  isAIAssistantSession(this.session)
                    ? html`
                      <button
                        class="bg-transparent border-0 p-0 cursor-pointer transition-opacity duration-200 text-primary magic-button flex-shrink-0 ${this.isHovered ? 'opacity-50 hover:opacity-100' : 'opacity-0'} ml-1"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this.handleMagicButton();
                        }}
                        title="Send prompt to update terminal title"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9.5 21.5L21.5 9.5a1 1 0 000-1.414l-1.086-1.086a1 1 0 00-1.414 0L7 19l2.5 2.5z" opacity="0.9"/>
                          <path d="M6 18l-1.5 3.5a.5.5 0 00.7.7L8.5 21l-2.5-3z" opacity="0.9"/>
                          <circle cx="8" cy="4" r="1"/>
                          <circle cx="4" cy="8" r="1"/>
                          <circle cx="16" cy="4" r="1"/>
                          <circle cx="20" cy="8" r="1"/>
                          <circle cx="12" cy="2" r=".5"/>
                          <circle cx="2" cy="12" r=".5"/>
                          <circle cx="22" cy="12" r=".5"/>
                          <circle cx="18" cy="2" r=".5"/>
                        </svg>
                      </button>
                      <style>
                        @media (hover: none) and (pointer: coarse) {
                          .magic-button {
                            opacity: 0.5 !important;
                          }
                          .magic-button:hover {
                            opacity: 1 !important;
                          }
                        }
                      </style>
                    `
                    : ''
                }
              </div>
            </div>
            <div class="text-xs opacity-75 mt-0.5 flex items-center gap-2 min-w-0 overflow-hidden">
              <clickable-path
                class="min-w-0 flex-1 truncate"
                .path=${this.session.workingDir}
                .iconSize=${12}
              ></clickable-path>
              ${
                this.session.gitRepoPath
                  ? html`
                    <git-status-badge
                      class="min-w-0 max-w-[30%] sm:max-w-none"
                      .session=${this.session}
                      .detailed=${false}
                    ></git-status-badge>
                  `
                  : ''
              }
            </div>
            ${this.tmuxStatus ? html`
              <div class="text-xs opacity-75 mt-0.5 truncate text-text-muted font-mono">
                ${this.tmuxStatus}
              </div>
            ` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2 text-xs flex-shrink-0 ml-2">
          ${this.isTmuxSession() ? html`
            <tmux-cheat-sheet
              .isMobile=${this.isMobile}
            ></tmux-cheat-sheet>
          ` : ''}

          ${
            this.useCompactMenu
              ? html`
              <div class="flex items-center gap-2 flex-shrink-0">
                <compact-menu
                  .session=${this.session}
                  .widthLabel=${this.widthLabel}
                  .widthTooltip=${this.widthTooltip}
                  .onOpenFileBrowser=${this.onOpenFileBrowser}
                  .onUploadImage=${() => this.handleMobileUploadImage()}
                  .onMaxWidthToggle=${this.onMaxWidthToggle}
                  .onOpenSettings=${this.onOpenSettings}
                  .onCreateSession=${this.onCreateSession}
                  .currentTheme=${this.currentTheme}
                  .macAppConnected=${this.macAppConnected}
                  .onTerminateSession=${this.onTerminateSession}
                  .onClearSession=${this.onClearSession}
                  .hasGitRepo=${this.hasGitRepo}
                  .viewMode=${this.viewMode}
                  .onToggleViewMode=${() => this.dispatchEvent(new CustomEvent('toggle-view-mode'))}
                  .chatMode=${this.chatMode}
                  .onToggleChatMode=${this.onToggleChatMode}
                  @theme-changed=${(e: CustomEvent) => {
                    this.currentTheme = e.detail.theme;
                  }}
                ></compact-menu>
              </div>
            `
              : html`
              <!-- Individual buttons for larger screens -->
              <div class="flex items-center gap-2">
                <!-- Git worktree toggle button (visible when session has Git repo) -->
                ${
                  this.hasGitRepo
                    ? html`
                      <button
                        class="bg-bg-tertiary border border-border rounded-md p-2 text-primary transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                        @click=${() => this.onToggleViewMode?.()}
                        title="${this.viewMode === 'terminal' ? 'Show Worktrees' : 'Show Terminal'}"
                        data-testid="worktree-toggle-button"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                        </svg>
                  </button>
                    `
                    : ''
                }

                <!-- Status dropdown -->
                <session-status-dropdown
                  .session=${this.session}
                  .onTerminate=${this.onTerminateSession}
                  .onClear=${this.onClearSession}
                ></session-status-dropdown>
                
                <!-- Image Upload Menu -->
                <image-upload-menu
                  .onPasteImage=${() => this.handlePasteImage()}
                  .onSelectImage=${() => this.handleSelectImage()}
                  .onOpenCamera=${() => this.handleOpenCamera()}
                  .onBrowseFiles=${() => this.onOpenFileBrowser?.()}
                  .isMobile=${this.isMobile}
                ></image-upload-menu>
                
                <!-- Theme toggle -->
                <theme-toggle-icon
                  .theme=${this.currentTheme}
                  @theme-changed=${(e: CustomEvent) => {
                    this.currentTheme = e.detail.theme;
                  }}
                ></theme-toggle-icon>
                
                <!-- Settings button -->
                <notification-status
                  @open-settings=${() => this.onOpenSettings?.()}
                ></notification-status>
                
                
                <!-- Terminal size button -->
                <button
                  class="bg-bg-tertiary border border-border rounded-lg px-3 py-2 font-mono text-xs text-text-muted transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary hover:shadow-sm flex-shrink-0 width-selector-button"
                  @click=${() => this.onMaxWidthToggle?.()}
                  title="${this.widthTooltip}"
                >
                  ${this.widthLabel}
                </button>
              </div>
            `
          }
        </div>
      </div>
    `;
  }

  private handleRename(newName: string) {
    if (!this.session) return;

    // Dispatch event to parent component to handle the rename
    this.dispatchEvent(
      new CustomEvent('session-rename', {
        detail: {
          sessionId: this.session.id,
          newName: newName,
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleMagicButton() {
    if (!this.session) return;

    logger.log('Magic button clicked for session', this.session.id);

    sendAIPrompt(this.session.id, authClient).catch((error) => {
      logger.error('Failed to send AI prompt', error);
    });
  }

  private handleMouseEnter = () => {
    this.isHovered = true;
  };

  private handleMouseLeave = () => {
    this.isHovered = false;
  };

  private handlePasteImage() {
    // Dispatch event to session-view to handle paste
    this.dispatchEvent(
      new CustomEvent('paste-image', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleSelectImage() {
    // Always dispatch select-image event to trigger the OS picker directly
    this.dispatchEvent(
      new CustomEvent('select-image', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleOpenCamera() {
    // Dispatch event to session-view to open camera
    this.dispatchEvent(
      new CustomEvent('open-camera', {
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleMobileUploadImage() {
    // Directly trigger the OS image picker
    this.dispatchEvent(
      new CustomEvent('select-image', {
        bubbles: true,
        composed: true,
      })
    );
  }
}
