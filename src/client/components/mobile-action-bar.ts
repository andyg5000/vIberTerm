/**
 * Mobile Action Bar Component
 *
 * A comprehensive mobile-first action bar that provides quick access to:
 * - Command palette (Ctrl+Shift+P)
 * - Clipboard manager with paste functionality
 * - Slash commands for Claude Code
 * - Session management actions
 * - File operations
 * - Terminal settings
 *
 * Features:
 * - Touch-friendly 44px minimum targets
 * - Swipe gestures support
 * - Long-press actions
 * - Haptic feedback
 * - Adaptive layout based on screen size
 */
import { html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Session } from '../../shared/types.js';
import { createLogger } from '../utils/logger.js';
import { detectMobile } from '../utils/mobile-utils.js';
import type { ClipboardManagerCallbacks } from './clipboard-manager.js';
import type { CommandPaletteCallbacks } from './command-palette.js';
import type { SlashCommandsCallbacks } from './slash-commands.js';

// Import the new components
import './command-palette.js';
import './clipboard-manager.js';
import './slash-commands.js';

const logger = createLogger('mobile-action-bar');

export interface MobileActionBarCallbacks
  extends CommandPaletteCallbacks,
    ClipboardManagerCallbacks,
    SlashCommandsCallbacks {
  // Additional mobile-specific callbacks
  onShowKeyboard?: () => void;
  onHideKeyboard?: () => void;
  onToggleActionBar?: () => void;
  onTriggerHaptic?: (type: 'light' | 'medium' | 'heavy') => void;
  onSpecialKey?: (
    key: string,
    isModifier?: boolean,
    isSpecial?: boolean,
    isToggle?: boolean
  ) => void;
}

// Special terminal keys shown when keyboard is active
interface SpecialKey {
  key: string;
  label: string;
  modifier?: boolean;
  arrow?: boolean;
  combo?: boolean;
}

const SPECIAL_KEYS: SpecialKey[] = [
  { key: 'Escape', label: 'Esc' },
  { key: 'Tab', label: 'Tab' },
  { key: 'ArrowUp', label: '↑', arrow: true },
  { key: 'ArrowDown', label: '↓', arrow: true },
  { key: 'ArrowLeft', label: '←', arrow: true },
  { key: 'ArrowRight', label: '→', arrow: true },
  { key: 'Ctrl+C', label: '^C', combo: true },
  { key: 'Ctrl+Z', label: '^Z', combo: true },
  { key: 'Ctrl+D', label: '^D', combo: true },
  { key: 'Ctrl+L', label: '^L', combo: true },
  { key: 'Ctrl+R', label: '^R', combo: true },
  { key: 'Ctrl+A', label: '^A', combo: true },
  { key: 'Ctrl+E', label: '^E', combo: true },
  { key: 'Ctrl+U', label: '^U', combo: true },
  { key: 'Ctrl+W', label: '^W', combo: true },
  { key: 'Paste', label: 'Paste' },
  { key: '|', label: '|' },
  { key: '`', label: '`' },
  { key: '~', label: '~' },
  { key: '/', label: '/' },
  { key: '\\', label: '\\' },
  { key: '-', label: '-' },
  { key: 'Done', label: 'Done' },
];

interface ActionButton {
  id: string;
  title: string;
  icon: string;
  action:
    | keyof MobileActionBarCallbacks
    | 'showCommandPalette'
    | 'showClipboardManager'
    | 'showSlashCommands';
  shortcut?: string;
  longPressAction?: keyof MobileActionBarCallbacks;
  highlight?: boolean;
  badge?: string | number;
  category: 'primary' | 'secondary' | 'utility';
}

@customElement('mobile-action-bar')
export class MobileActionBar extends LitElement {
  // Disable shadow DOM to use Tailwind
  createRenderRoot() {
    return this;
  }

  @property({ type: Boolean }) visible = true;
  @property({ type: Object }) session: Session | null = null;
  @property({ type: Object }) callbacks: MobileActionBarCallbacks | null = null;
  @property({ type: Boolean }) keyboardVisible = false;
  @property({ type: String }) currentMode: 'normal' | 'plan' | 'auto-accept' = 'normal';
  @property({ type: Number }) keyboardHeight = 0;

  @state() private showCommandPalette = false;
  @state() private showClipboardManager = false;
  @state() private showSlashCommands = false;
  @state() private isExpanded = false;
  @state() private longPressTimer: number | null = null;
  @state() private isMobile = detectMobile();

  // Key repeat for arrow keys
  private keyRepeatInterval: number | null = null;
  private keyRepeatTimeout: number | null = null;

  private readonly primaryActions: ActionButton[] = [
    // Temporarily disabled - no functionality yet
    // {
    //   id: 'command-palette',
    //   title: 'Command Palette',
    //   icon: '⚡',
    //   action: 'showCommandPalette', // Internal action to show modal
    //   shortcut: 'Ctrl+Shift+P',
    //   highlight: true,
    //   category: 'primary',
    // },
    {
      id: 'clipboard',
      title: 'Clipboard',
      icon: '📋',
      action: 'showClipboardManager', // Internal action to show modal
      longPressAction: 'onPasteFromClipboard',
      category: 'primary',
    },
    // Temporarily disabled - no functionality yet
    // {
    //   id: 'slash-commands',
    //   title: 'Slash Commands',
    //   icon: '/',
    //   action: 'showSlashCommands', // Internal action to show modal
    //   highlight: true,
    //   category: 'primary',
    // },
    {
      id: 'keyboard',
      title: 'Keyboard',
      icon: '⌨️',
      action: 'onShowKeyboard',
      category: 'primary',
    },
  ];

  private readonly secondaryActions: ActionButton[] = [
    {
      id: 'new-session',
      title: 'New Session',
      icon: '➕',
      action: 'onCreateSession',
      shortcut: 'Ctrl+N',
      category: 'secondary',
    },
    {
      id: 'files',
      title: 'Files',
      icon: '📁',
      action: 'onOpenFileBrowser',
      longPressAction: 'onUploadFile',
      category: 'secondary',
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: '⚙️',
      action: 'onOpenTerminalSettings',
      category: 'secondary',
    },
    {
      id: 'theme',
      title: 'Theme',
      icon: '🌓',
      action: 'onToggleTheme',
      category: 'secondary',
    },
  ];

  connectedCallback() {
    super.connectedCallback();

    // Ensure all modals start closed
    this.closeAllModals();

    // Listen for orientation changes
    window.addEventListener('orientationchange', this.handleOrientationChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    window.removeEventListener('orientationchange', this.handleOrientationChange);

    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    this.stopKeyRepeat();
  }

  private handleOrientationChange = () => {
    // Small delay to let the orientation change complete
    setTimeout(() => {
      this.requestUpdate();
    }, 100);
  };

  private async triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light') {
    if (this.callbacks?.onTriggerHaptic) {
      this.callbacks.onTriggerHaptic(type);
    }

    // Fallback to native haptic feedback on supported devices
    if ('vibrate' in navigator) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [50],
      };
      navigator.vibrate(patterns[type]);
    }
  }

  private handleButtonPress(button: ActionButton, event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();

    logger.debug(`Button pressed: ${button.id}`);
    this.triggerHaptic('light');

    // Set timer for all buttons - we'll check for long press action in the timeout
    this.longPressTimer = window.setTimeout(() => {
      // This timeout means it's a long press
      if (button.longPressAction) {
        logger.debug(`Long press action: ${button.longPressAction}`);
        this.triggerHaptic('medium');
        this.executeAction(button.longPressAction);
      }
      this.longPressTimer = null;
    }, 500); // 500ms long press
  }

  private handleButtonRelease(button: ActionButton, event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();

    // If long press timer is still active, it's a regular tap
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
      logger.debug(`Button tap: ${button.id} -> ${button.action}`);
      this.executeAction(button.action);
    } else {
      logger.debug(`Button release but no timer: ${button.id}`);
    }
  }

  private executeAction(
    action:
      | keyof MobileActionBarCallbacks
      | 'showCommandPalette'
      | 'showClipboardManager'
      | 'showSlashCommands'
  ) {
    logger.debug(`Executing mobile action: ${action}`);

    // Handle internal actions
    switch (action) {
      case 'showCommandPalette':
        logger.debug('Toggling command palette - current state:', this.showCommandPalette);
        if (this.showCommandPalette) {
          this.showCommandPalette = false;
        } else {
          this.closeAllModals();
          this.showCommandPalette = true;
        }
        return;
      case 'showClipboardManager':
        logger.debug('Toggling clipboard manager - current state:', this.showClipboardManager);
        if (this.showClipboardManager) {
          this.showClipboardManager = false;
        } else {
          this.closeAllModals();
          this.showClipboardManager = true;
        }
        return;
      case 'showSlashCommands':
        logger.debug('Toggling slash commands - current state:', this.showSlashCommands);
        if (this.showSlashCommands) {
          // If already open, close it
          this.showSlashCommands = false;
          logger.debug('Closed slash commands');
        } else {
          // If closed, open it (and close others)
          this.closeAllModals();
          this.showSlashCommands = true;
          logger.debug('Opened slash commands');
        }
        return;
      case 'onToggleActionBar':
        this.isExpanded = !this.isExpanded;
        return;
    }

    // Execute callback if available (only for actual callback actions)
    if (typeof action === 'string' && action.startsWith('on')) {
      const callback = this.callbacks?.[action as keyof MobileActionBarCallbacks];

      if (callback && typeof callback === 'function') {
        // Handle callbacks that require parameters
        if (action === 'onTriggerHaptic') {
          (callback as (type: 'light' | 'medium' | 'heavy') => void)('light');
        } else {
          (callback as () => void)();
        }
      }
    }
  }

  private handleSpecialKeyPress(key: SpecialKey) {
    this.triggerHaptic('light');

    if (key.key === 'Done') {
      // Dismiss keyboard
      if (this.callbacks?.onHideKeyboard) {
        this.callbacks.onHideKeyboard();
      }
      // Also fire onSpecialKey so the direct keyboard manager can dismiss
      if (this.callbacks?.onSpecialKey) {
        this.callbacks.onSpecialKey(key.key, false, true);
      }
      return;
    }

    if (this.callbacks?.onSpecialKey) {
      this.callbacks.onSpecialKey(key.key, key.modifier, false);
    }
  }

  private startKeyRepeat(key: SpecialKey) {
    if (!key.arrow) return;

    this.stopKeyRepeat();

    // First key press is immediate via handleSpecialKeyPress
    this.keyRepeatTimeout = window.setTimeout(() => {
      this.keyRepeatInterval = window.setInterval(() => {
        if (this.callbacks?.onSpecialKey) {
          this.callbacks.onSpecialKey(key.key, false, false);
        }
      }, 50);
    }, 500);
  }

  private stopKeyRepeat() {
    if (this.keyRepeatTimeout) {
      clearTimeout(this.keyRepeatTimeout);
      this.keyRepeatTimeout = null;
    }
    if (this.keyRepeatInterval) {
      clearInterval(this.keyRepeatInterval);
      this.keyRepeatInterval = null;
    }
  }

  private closeAllModals(): void {
    this.showCommandPalette = false;
    this.showClipboardManager = false;
    this.showSlashCommands = false;
  }

  render() {
    if (!this.visible || !this.isMobile) {
      logger.debug('Mobile action bar not rendering:', {
        visible: this.visible,
        isMobile: this.isMobile,
      });
      return html``;
    }

    // Debug logging
    logger.debug('Mobile action bar rendering:', {
      visible: this.visible,
      isMobile: this.isMobile,
      showCommandPalette: this.showCommandPalette,
      showClipboardManager: this.showClipboardManager,
      showSlashCommands: this.showSlashCommands,
    });

    // When keyboard is visible, special keys sit at the bottom above the keyboard,
    // and the floating action bar sits above the special keys row
    const specialKeysHeight = this.keyboardVisible ? 44 : 0;
    const dynamicStyle =
      this.keyboardVisible && this.keyboardHeight > 0
        ? `bottom: ${this.keyboardHeight + specialKeysHeight + 8}px; left: 50%; transform: translateX(-50%);`
        : `bottom: calc(env(safe-area-inset-bottom, 16px) + 16px); left: 50%; transform: translateX(-50%);`;

    const specialKeysStyle =
      this.keyboardVisible && this.keyboardHeight > 0
        ? `bottom: ${this.keyboardHeight}px;`
        : 'bottom: 0;';

    return html`
      <!-- Special Keys Row (visible when keyboard is active) -->
      ${
        this.keyboardVisible
          ? html`
        <div
          id="mobile-special-keys"
          class="fixed left-0 right-0 bg-bg-secondary/98 backdrop-blur-lg border-t border-border/50"
          style="${specialKeysStyle} z-index: 1099; position: fixed !important; height: 44px;"
        >
          <div
            class="flex items-center gap-1 px-1 h-full overflow-x-auto"
            style="-webkit-overflow-scrolling: touch; scrollbar-width: none;"
          >
            ${SPECIAL_KEYS.map(
              (key) => html`
              <button
                id="special-key-${key.key.replace(/[+]/g, '-').toLowerCase()}"
                class="flex-shrink-0 h-9 px-2 min-w-[36px] rounded-md font-mono text-xs font-medium transition-all duration-100
                  ${key.key === 'Done' ? 'bg-primary text-text-bright' : key.combo ? 'bg-bg-tertiary text-primary border border-border-accent' : key.arrow ? 'bg-bg-tertiary text-text text-base' : 'bg-bg-tertiary text-text border border-border'}
                  active:scale-95 touch-manipulation"
                @touchstart=${(e: TouchEvent) => {
                  e.stopPropagation();
                  if (key.arrow) {
                    this.handleSpecialKeyPress(key);
                    this.startKeyRepeat(key);
                  }
                }}
                @touchend=${(e: TouchEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (key.arrow) {
                    this.stopKeyRepeat();
                  } else {
                    this.handleSpecialKeyPress(key);
                  }
                }}
                @touchcancel=${() => {
                  this.stopKeyRepeat();
                }}
                @mousedown=${(e: Event) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                aria-label="${key.label}"
              >${key.label}</button>
            `
            )}
          </div>
        </div>
      `
          : ''
      }

      <!-- Mobile Action Bar -->
      <div
        class="fixed transition-all duration-300 ${this.isExpanded ? 'scale-105' : 'scale-100'}"
        style="${dynamicStyle} z-index: 1100; position: fixed !important;"
      >
        <!-- Primary Actions (Always Visible) -->
        <div class="bg-bg/90 backdrop-blur-lg border border-border/50 rounded-2xl shadow-2xl p-2 max-w-sm mx-auto">
          <div class="flex items-center gap-2">
            ${this.primaryActions.map(
              (button) => html`
              <button
                class="relative flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 ${
                  button.highlight
                    ? 'bg-primary/20 border border-primary/30 text-primary'
                    : 'bg-bg-secondary/80 hover:bg-surface-hover text-text hover:text-primary'
                } active:scale-95 touch-manipulation"
                @pointerdown=${(e: PointerEvent) => this.handleButtonPress(button, e)}
                @pointerup=${(e: PointerEvent) => this.handleButtonRelease(button, e)}
                @pointercancel=${() => {
                  if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                  }
                }}
                title="${button.title}${button.longPressAction ? ' (Long press for more)' : ''}"
                aria-label="${button.title}"
              >
                <span class="text-xl mb-0.5">${button.icon}</span>
                <span class="text-xs font-medium leading-none">${button.title.split(' ')[0]}</span>
                
                ${
                  button.badge
                    ? html`
                  <div class="absolute -top-1 -right-1 bg-status-error text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    ${button.badge}
                  </div>
                `
                    : ''
                }
                
                ${
                  button.longPressAction
                    ? html`
                  <div class="absolute bottom-0 right-0 w-2 h-2 bg-primary/60 rounded-full"></div>
                `
                    : ''
                }
              </button>
            `
            )}
            
            <!-- Expand/Collapse Toggle -->
            <button
              class="flex items-center justify-center w-8 h-14 text-text-muted hover:text-text transition-colors ml-1"
              @click=${() => {
                this.isExpanded = !this.isExpanded;
                this.triggerHaptic('light');
              }}
              title="${this.isExpanded ? 'Collapse' : 'More actions'}"
              aria-label="${this.isExpanded ? 'Collapse menu' : 'Show more actions'}"
            >
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 20 20" 
                fill="currentColor"
                class="transition-transform duration-200 ${this.isExpanded ? 'rotate-180' : ''}"
              >
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
          
          <!-- Secondary Actions (Expandable) -->
          ${
            this.isExpanded
              ? html`
            <div class="mt-2 pt-2 border-t border-border/30">
              <div class="flex items-center gap-2 justify-center">
                ${this.secondaryActions.map(
                  (button) => html`
                  <button
                    class="relative flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 bg-bg-tertiary/80 hover:bg-surface-hover text-text-muted hover:text-text active:scale-95 touch-manipulation"
                    @pointerdown=${(e: PointerEvent) => this.handleButtonPress(button, e)}
                    @pointerup=${(e: PointerEvent) => this.handleButtonRelease(button, e)}
                    @pointercancel=${() => {
                      if (this.longPressTimer) {
                        clearTimeout(this.longPressTimer);
                        this.longPressTimer = null;
                      }
                    }}
                    title="${button.title}${button.longPressAction ? ' (Long press for more)' : ''}"
                    aria-label="${button.title}"
                  >
                    <span class="text-lg mb-0.5">${button.icon}</span>
                    <span class="text-xs font-medium leading-none">${button.title.split(' ')[0]}</span>
                    
                    ${
                      button.longPressAction
                        ? html`
                      <div class="absolute bottom-0 right-0 w-1.5 h-1.5 bg-primary/60 rounded-full"></div>
                    `
                        : ''
                    }
                  </button>
                `
                )}
              </div>
            </div>
          `
              : ''
          }
        </div>
        
        <!-- Mode Indicator -->
        ${
          this.currentMode !== 'normal'
            ? html`
          <div class="mt-2 text-center">
            <div class="inline-flex items-center gap-2 bg-primary/20 border border-primary/30 rounded-full px-3 py-1">
              <div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <span class="text-xs font-medium text-primary uppercase">
                ${this.currentMode === 'plan' ? 'Plan Mode' : 'Auto Accept'}
              </span>
            </div>
          </div>
        `
            : ''
        }
      </div>

      <!-- Command Palette Modal -->
      <command-palette
        .visible=${this.showCommandPalette}
        .session=${this.session}
        .callbacks=${this.callbacks}
        .currentMode=${this.currentMode}
        .planModeActive=${this.currentMode === 'plan'}
        .autoAcceptActive=${this.currentMode === 'auto-accept'}
        @close=${() => {
          this.showCommandPalette = false;
        }}
      ></command-palette>

      <!-- Clipboard Manager Modal -->
      <clipboard-manager
        .visible=${this.showClipboardManager}
        .callbacks=${this.callbacks}
        @close=${() => {
          this.showClipboardManager = false;
        }}
      ></clipboard-manager>

      <!-- Slash Commands Modal -->
      <slash-commands
        .visible=${this.showSlashCommands}
        .session=${this.session}
        .callbacks=${this.callbacks}
        @close=${() => {
          this.showSlashCommands = false;
        }}
      ></slash-commands>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-action-bar': MobileActionBar;
  }
}
