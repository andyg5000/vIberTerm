import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('terminal-chat-view')
export class TerminalChatView extends LitElement {
  createRenderRoot() {
    return this;
  }
}
