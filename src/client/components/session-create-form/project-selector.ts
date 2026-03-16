/**
 * Project Selector Component
 *
 * Simple dropdown for selecting a project when creating or editing sessions.
 *
 * @fires project-changed - When a project is selected (detail: { projectId: string | undefined })
 */
import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Project } from '../../../shared/types.js';

@customElement('project-selector')
export class ProjectSelector extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Array }) projects: Project[] = [];
  @property({ type: String }) selectedProjectId?: string;
  @property({ type: Boolean }) disabled = false;

  private handleChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const projectId = select.value || undefined;
    this.dispatchEvent(
      new CustomEvent('project-changed', {
        detail: { projectId },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (this.projects.length === 0) return html``;

    return html`
      <div class="flex items-center gap-2">
        <label class="text-xs text-text-muted whitespace-nowrap">Project:</label>
        <select
          class="input-field text-xs py-1 px-2 flex-1"
          .value=${this.selectedProjectId || ''}
          @change=${this.handleChange}
          ?disabled=${this.disabled}
          data-testid="project-selector"
        >
          <option value="">No project</option>
          ${this.projects.map(
            (project) => html`
              <option value=${project.id} ?selected=${this.selectedProjectId === project.id}>
                ${project.name}
              </option>
            `
          )}
        </select>
      </div>
    `;
  }
}
