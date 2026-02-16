import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('git-status-badge')
export class GitStatusBadge extends LitElement {
  createRenderRoot() {
    return this;
  }
}
