import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('ssh-agent')
export class SshAgent extends LitElement {
  createRenderRoot() {
    return this;
  }
}
