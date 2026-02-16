import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('worktree-manager')
export class WorktreeManager extends LitElement {
  createRenderRoot() {
    return this;
  }
}
