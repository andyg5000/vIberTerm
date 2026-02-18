/**
 * Confirm Dialog Component
 *
 * A reusable confirmation dialog with backdrop, escape key, and click-outside handling.
 *
 * @fires confirm - When the confirm button is clicked
 * @fires cancel - When the cancel button, backdrop click, or escape key is used
 */
import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('confirm-dialog')
export class ConfirmDialog extends LitElement {
  createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) visible = false;
  @property({ type: String }) dialogTitle = 'Confirm';
  @property({ type: String }) message = 'Are you sure?';
  @property({ type: String }) confirmLabel = 'Confirm';
  @property({ type: String }) cancelLabel = 'Cancel';
  @property({ type: Boolean }) danger = false;

  private boundKeyDown = this.handleKeyDown.bind(this);

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('visible')) {
      if (this.visible) {
        document.addEventListener('keydown', this.boundKeyDown);
      } else {
        document.removeEventListener('keydown', this.boundKeyDown);
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.boundKeyDown);
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.handleCancel();
    }
  }

  private handleConfirm() {
    this.dispatchEvent(new CustomEvent('confirm'));
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent('cancel'));
  }

  private handleBackdropClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.handleCancel();
    }
  }

  render() {
    if (!this.visible) {
      return html``;
    }

    const confirmClasses = this.danger
      ? 'px-4 py-2 rounded-lg text-sm font-medium bg-status-error text-white hover:opacity-90 transition-opacity cursor-pointer'
      : 'px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary text-white hover:opacity-90 transition-opacity cursor-pointer';

    return html`
      <div
        class="modal-backdrop flex items-center justify-center p-2 sm:p-4"
        @click=${this.handleBackdropClick}
      >
        <div
          class="modal-content font-mono text-sm w-full max-w-sm"
          role="dialog"
          aria-modal="true"
          aria-label="${this.dialogTitle}"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <div class="bg-bg-secondary border border-border rounded-xl p-6 shadow-lg">
            <h3 class="text-base font-semibold text-primary mb-2">${this.dialogTitle}</h3>
            <p class="text-sm text-text-muted mb-6">${this.message}</p>
            <div class="flex justify-end gap-3">
              <button
                class="px-4 py-2 rounded-lg text-sm font-medium bg-bg-tertiary text-text-muted hover:text-text hover:bg-bg-elevated transition-colors border border-border cursor-pointer"
                @click=${this.handleCancel}
              >
                ${this.cancelLabel}
              </button>
              <button
                class="${confirmClasses}"
                @click=${this.handleConfirm}
              >
                ${this.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'confirm-dialog': ConfirmDialog;
  }
}
