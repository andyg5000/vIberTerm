/**
 * Project Header Component
 *
 * Displays a project header with color indicator, name, session count, and collapse toggle.
 * Used to group sessions by project in the session list.
 * Mirrors the repository-header.ts pattern.
 */
import { html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('project-header')
export class ProjectHeader extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: String }) projectName!: string;
  @property({ type: String }) projectColor?: string;
  @property({ type: Number }) sessionCount = 0;
  @property({ type: Boolean }) collapsed = false;
  @property({ type: Object }) chevron?: TemplateResult | string;

  render() {
    const dotColor = this.projectColor || '#6366f1';

    return html`
      <div class="flex items-center justify-between mb-3 cursor-pointer select-none">
        <div class="flex items-center gap-2">
          ${this.chevron || ''}
          <div
            class="w-3 h-3 rounded-full flex-shrink-0"
            style="background-color: ${dotColor}"
          ></div>
          <h4 class="text-sm font-medium text-text-muted flex items-center gap-2">
            ${this.projectName}
            <span class="text-[10px] text-text-dim">(${this.sessionCount})</span>
          </h4>
        </div>
      </div>
    `;
  }
}
