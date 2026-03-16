/**
 * Project Selector Component
 *
 * Dropdown for selecting or creating a project when creating or editing sessions.
 *
 * @fires project-changed - When a project is selected (detail: { projectId: string | undefined })
 * @fires project-created - When a new project is created (detail: { project: Project })
 */
import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Project } from '../../../shared/types.js';
import { HttpMethod } from '../../../shared/types.js';

const NEW_PROJECT_VALUE = '__new__';

@customElement('project-selector')
export class ProjectSelector extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Array }) projects: Project[] = [];
  @property({ type: String }) selectedProjectId?: string;
  @property({ type: Boolean }) disabled = false;

  @state() private creatingProject = false;
  @state() private newProjectName = '';
  @state() private newProjectColor = this.randomColor();

  private randomColor(): string {
    const colors = [
      '#6366f1',
      '#ec4899',
      '#f59e0b',
      '#10b981',
      '#3b82f6',
      '#8b5cf6',
      '#ef4444',
      '#14b8a6',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private handleChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    if (select.value === NEW_PROJECT_VALUE) {
      this.creatingProject = true;
      this.newProjectColor = this.randomColor();
      // Reset select to current value
      select.value = this.selectedProjectId || '';
      return;
    }
    const projectId = select.value || undefined;
    this.dispatchEvent(
      new CustomEvent('project-changed', {
        detail: { projectId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private async handleCreateProject() {
    const name = this.newProjectName.trim();
    if (!name) return;

    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name,
      color: this.newProjectColor,
    };

    // Save to server
    try {
      const updatedProjects = [...this.projects, newProject];
      const response = await fetch('/api/config', {
        method: HttpMethod.PUT,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: updatedProjects }),
      });

      if (response.ok) {
        // Update local projects so the dropdown shows the name immediately
        this.projects = updatedProjects;
        this.creatingProject = false;
        this.newProjectName = '';

        this.dispatchEvent(
          new CustomEvent('project-created', {
            detail: { project: newProject },
            bubbles: true,
            composed: true,
          })
        );
        // Auto-select the new project
        this.dispatchEvent(
          new CustomEvent('project-changed', {
            detail: { projectId: newProject.id },
            bubbles: true,
            composed: true,
          })
        );
      }
    } catch {
      // Keep the form open on error
    }
  }

  private handleCancelCreate() {
    this.creatingProject = false;
    this.newProjectName = '';
  }

  render() {
    return html`
      <div class="flex flex-col gap-1.5">
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
            <option value=${NEW_PROJECT_VALUE}>+ New project...</option>
          </select>
        </div>
        ${
          this.creatingProject
            ? html`
              <div class="flex items-center gap-1.5">
                <input
                  type="color"
                  .value=${this.newProjectColor}
                  @input=${(e: Event) => {
                    this.newProjectColor = (e.target as HTMLInputElement).value;
                  }}
                  class="w-6 h-6 rounded border border-border cursor-pointer flex-shrink-0"
                  title="Project color"
                />
                <input
                  type="text"
                  class="input-field text-xs py-1 px-2 flex-1"
                  placeholder="Project name"
                  .value=${this.newProjectName}
                  @input=${(e: Event) => {
                    this.newProjectName = (e.target as HTMLInputElement).value;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter') this.handleCreateProject();
                    if (e.key === 'Escape') this.handleCancelCreate();
                  }}
                  data-testid="new-project-name-input"
                />
                <button
                  class="text-xs px-2 py-1 bg-primary text-white rounded transition-colors hover:bg-primary-hover disabled:opacity-50"
                  @click=${this.handleCreateProject}
                  ?disabled=${!this.newProjectName.trim()}
                >Add</button>
                <button
                  class="text-xs px-2 py-1 bg-bg-tertiary text-text-muted rounded transition-colors hover:bg-bg-elevated"
                  @click=${this.handleCancelCreate}
                >Cancel</button>
              </div>
            `
            : ''
        }
      </div>
    `;
  }
}
