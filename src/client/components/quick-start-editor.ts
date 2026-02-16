import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('quick-start-editor')
export class QuickStartEditor extends LitElement {
  createRenderRoot() {
    return this;
  }
}
