import { Component, Host, h, Prop, State, Watch, Event, EventEmitter } from '@stencil/core';
import { Meeting } from '../../types/dyte-client';
import { Size, States } from '../../types/props';
import { shorten } from '../../utils/string';
import { UIConfig } from '../../types/ui-config';
import { defaultConfig } from '../../lib/default-ui-config';
import { Render } from '../../lib/render';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import gracefulStorage from '../../utils/graceful-storage';
import storeState from '../../lib/store';

/**
 * A screen shown before joining the meeting, where you can edit your display name,
 * and media settings.
 */
@Component({
  tag: 'dyte-setup-screen',
  styleUrl: 'dyte-setup-screen.css',
  shadow: true,
})
export class DyteSetupScreen {
  private inputEl: HTMLInputElement;
  /** Meeting object */
  @Prop() meeting!: Meeting;

  /** States object */
  @Prop() states: States = storeState;

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Config object */
  @Prop() config: UIConfig = defaultConfig;

  /** Emits updated state data */
  @Event({ eventName: 'dyteStateUpdate' }) stateUpdate: EventEmitter<States>;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  @State() displayName: string;

  @State() isJoining: boolean = false;

  @State() canEditName: boolean = true;

  connectedCallback() {
    this.meetingChanged(this.meeting);
  }

  componentDidLoad() {
    this.inputEl?.focus();
  }

  @Watch('meeting')
  meetingChanged(meeting: Meeting) {
    if (meeting != null) {
      this.canEditName = meeting.self.permissions.canEditDisplayName ?? true;
      this.displayName = meeting.self.name?.trim() || '';
      storeState.meeting = 'setup';
    }
  }

  private join = async () => {
    if (this.displayName?.trim() !== '' && !this.isJoining) {
      this.isJoining = true;
      this.meeting?.self.setName(this.displayName);

      gracefulStorage.setItem('dyte-display-name', this.displayName);
      await this.meeting?.joinRoom();
    }
  };

  render() {
    const disabled = this.displayName?.trim() === '';

    const defaults = {
      meeting: this.meeting,
      config: this.config,
      states: this.states || storeState,
      size: this.size,
      iconPack: this.iconPack,
      t: this.t,
    };

    return (
      <Host>
        <div class="container">
          <Render
            element="dyte-participant-tile"
            defaults={defaults}
            props={{ participant: this.meeting?.self, size: 'md' }}
            childProps={{ participant: this.meeting?.self, size: 'md' }}
            deepProps
          />
          <div class="metadata">
            {this.displayName?.trim() === '' ? (
              <div class="name">{this.t('setup_screen.join_in_as')}</div>
            ) : (
              <div class="label">
                <p>{this.t('setup_screen.joining_as')}</p>
                <div class="name">{shorten(this.displayName, 20)}</div>
              </div>
            )}
            {/* TODO: Use `dyte-text-field` */}
            {this.canEditName && (
              <input
                placeholder={this.t('setup_screen.your_name')}
                value={this.displayName}
                autoFocus
                ref={(el) => {
                  this.inputEl = el;
                }}
                onInput={(e) => {
                  this.displayName = (e.target as HTMLInputElement).value;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    this.join();
                  }
                }}
              />
            )}
            <dyte-button
              size="lg"
              kind="wide"
              onClick={this.join}
              disabled={disabled}
              iconPack={this.iconPack}
              t={this.t}
            >
              {this.isJoining ? (
                <dyte-spinner iconPack={this.iconPack} t={this.t} />
              ) : (
                this.t('join')
              )}
            </dyte-button>
          </div>
        </div>
      </Host>
    );
  }
}
