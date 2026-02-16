import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

export interface SlashCommandsCallbacks {
  onShowSlashCommands?: () => void;
  onExecuteSlashCommand?: (command: string) => void;
}

@customElement('slash-commands')
export class SlashCommands extends LitElement {
  createRenderRoot() {
    return this;
  }
}
