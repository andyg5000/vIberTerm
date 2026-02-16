import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('file-browser')
export class FileBrowser extends LitElement {
  createRenderRoot() {
    return this;
  }
}
