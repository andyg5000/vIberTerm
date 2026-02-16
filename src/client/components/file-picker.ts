import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('file-picker')
export class FilePicker extends LitElement {
  createRenderRoot() {
    return this;
  }
}
