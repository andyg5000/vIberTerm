import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('tmux-cheat-sheet')
export class TmuxCheatSheet extends LitElement {
  // Disable shadow DOM to use Tailwind classes
  createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) isMobile = false;
  @state() private isHovered = false;

  private getTmuxShortcuts() {
    return [
      { key: 'Ctrl+B', desc: 'Prefix key (required before commands)' },
      { key: 'Ctrl+B c', desc: 'New window' },
      { key: 'Ctrl+B n/p', desc: 'Next / previous window' },
      { key: 'Ctrl+B 0-9', desc: 'Select window by number' },
      { key: 'Ctrl+B w', desc: 'Window list' },
      { key: 'Ctrl+B ,', desc: 'Rename window' },
      { key: 'Ctrl+B %', desc: 'Split pane vertical' },
      { key: 'Ctrl+B "', desc: 'Split pane horizontal' },
      { key: 'Ctrl+B arrow', desc: 'Switch panes' },
      { key: 'Ctrl+B z', desc: 'Zoom / unzoom pane' },
      { key: 'Ctrl+B x', desc: 'Kill pane' },
      { key: 'Ctrl+B [', desc: 'Copy / scroll mode' },
      { key: 'Ctrl+B d', desc: 'Detach from session' },
    ];
  }

  private renderTmuxIcon() {
    return html`
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="18" rx="2"/>
        <line x1="12" y1="3" x2="12" y2="21"/>
        <line x1="2" y1="12" x2="12" y2="12"/>
      </svg>
    `;
  }

  render() {
    if (this.isMobile) return html``;

    const buttonClasses = `
      bg-bg-tertiary border border-border rounded-lg p-2 font-mono
      transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary
      hover:shadow-sm flex-shrink-0 text-muted
    `.trim();

    return html`
      <div
        class="relative flex-shrink-0"
        @mouseenter=${() => { this.isHovered = true; }}
        @mouseleave=${() => { this.isHovered = false; }}
      >
        <button
          class="${buttonClasses}"
          title="tmux cheat sheet"
        >
          ${this.renderTmuxIcon()}
        </button>
        ${this.isHovered ? html`
          <div
            style="
              position: absolute;
              top: 100%;
              right: 0;
              margin-top: 0.5em;
              padding: 0.75em 1em;
              background: #1a1a1a;
              color: #e0e0e0;
              border: 1px solid #333;
              border-radius: 0.25em;
              font-size: 0.875em;
              white-space: normal;
              z-index: 1000;
              max-width: 340px;
              width: 340px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            "
          >
            <div>
              <strong>tmux Shortcuts</strong>
            </div>
            <div style="margin-top: 0.5em; padding-top: 0.5em; border-top: 1px solid #333;">
              ${this.getTmuxShortcuts().map(({ key, desc }) => html`
                <div style="display: flex; justify-content: space-between; gap: 1em; margin: 0.25em 0; font-family: monospace;">
                  <span style="font-weight: bold; white-space: nowrap;">${key}</span>
                  <span style="color: #999; text-align: right;">${desc}</span>
                </div>
              `)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tmux-cheat-sheet': TmuxCheatSheet;
  }
}
