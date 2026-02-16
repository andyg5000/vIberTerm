import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('monaco-editor-component')
export class MonacoEditorComponent extends LitElement {
  createRenderRoot() {
    return this;
  }
}
