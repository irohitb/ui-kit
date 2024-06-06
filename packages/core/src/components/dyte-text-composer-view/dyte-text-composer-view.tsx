import { Component, Event, EventEmitter, h, Method, Prop } from '@stencil/core';

/**
 * A component which renders a text composer
 */
@Component({
  tag: 'dyte-text-composer-view',
  styleUrl: 'dyte-text-composer-view.css',
  shadow: true,
})
export class DyteTextComposerView {
  /** Disable the text input (default = false) */
  @Prop() disabled: boolean = false;

  /** Placeholder text */
  @Prop() placeholder: string;

  /** Default value for text input */
  @Prop() value: string;

  /** Max length for text input */
  @Prop() maxLength: number;

  /** Keydown event handler function */
  @Prop() keyDownHandler: (e: KeyboardEvent) => void = () => {};

  /** Event emitted when text changes */
  @Event({ eventName: 'textChange' }) onTextChange: EventEmitter<string>;

  private $textArea: HTMLTextAreaElement;

  componentDidLoad() {
    if (this.maxLength) {
      this.$textArea.maxLength = this.maxLength;
    }
    const text = this.$textArea.value.trim();
    if (text !== '') {
      this.maybeResize(text);
    }
  }

  /** Sets value of the text input */
  @Method()
  async setText(text: string, focus: boolean = false) {
    this.$textArea.value = text;
    this.maybeResize(text);
    if (focus) {
      this.$textArea.focus();
    }
    this.onTextChange.emit(text);
  }

  private onInputHandler = () => {
    const text = this.$textArea.value.trim();
    this.maybeResize(text);
    this.onTextChange.emit(text);
  };

  private maybeResize = (text: string) => {
    const newLines = [...text.matchAll(/\n/g)].length;
    this.$textArea.style.height = `${Math.min(200, 60 + 20 * newLines)}px`;
  };

  render() {
    return (
      <div class="chat-input" part="chat-input-container">
        <textarea
          ref={(el) => (this.$textArea = el)}
          placeholder={this.placeholder}
          disabled={this.disabled}
          onInput={this.onInputHandler}
          onKeyDown={this.keyDownHandler}
          part="chat-input"
          value={this.value}
        ></textarea>
      </div>
    );
  }
}
