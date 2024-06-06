import { Component, Host, h, Prop, State, Watch, Event, EventEmitter } from '@stencil/core';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import { Meeting } from '../../types/dyte-client';
import { Size, States } from '../../types/props';

/**
 * A component which lets a user manage remote access requests for their screen.
 */
@Component({
  tag: 'dyte-remote-access-manager',
  styleUrl: 'dyte-remote-access-manager.css',
  shadow: true,
})
export class DyteRemoteAccessManager {
  @State() acceptedRequestId: string;

  /** Meeting object */
  @Prop() meeting!: Meeting;

  /** States object */
  @Prop() states: States;

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  /** Emits updated state data */
  @Event({ eventName: 'dyteStateUpdate' }) stateUpdate: EventEmitter<States>;

  disconnectedCallback() {}

  @Watch('meeting')
  meetingChanged(meeting: Meeting) {
    if (meeting != null) {
      if (!Boolean(this.acceptedRequestId) && Boolean(this.meeting?.remote?.active?.id)) {
        this.acceptedRequestId = this.meeting.remote?.active?.id;
      }
    }
  }

  render() {
    if (!Boolean(this?.meeting?.remote?.incomingRequests.toArray().length)) {
      return (
        <Host>
          <p class="empty-message">{this.t('remote_access.empty')}</p>
        </Host>
      );
    }

    return (
      <Host>
        <h3>{this.t('remote_access.requests')}</h3>
        <p>{this.t('remote_access.allow')}</p>
        <div class="scrollbar">
          {this?.meeting?.remote?.incomingRequests.toArray().map((incomingRequest) => {
            const requestPeer = this.meeting.participants.joined.get(incomingRequest.remotePeerId);
            return (
              // should use participant id for htmlFor instead
              <label
                onClick={() => {
                  this.acceptedRequestId = incomingRequest.id;
                }}
                class="participant"
                htmlFor={requestPeer.id}
              >
                <input
                  type="radio"
                  checked={this.acceptedRequestId === incomingRequest.id}
                  name="remote-access-participant"
                  value={incomingRequest.id}
                />
                <dyte-avatar participant={requestPeer} size="sm" />
                {requestPeer.name}
              </label>
            );
          })}
        </div>
        <div id="actions">
          <dyte-button
            disabled={!Boolean(this.acceptedRequestId)}
            iconPack={this.iconPack}
            t={this.t}
            onClick={() => {
              this.meeting?.remote?.acceptControl(this.acceptedRequestId);
              this.stateUpdate.emit({ activeRemoteAccessManager: false });
            }}
          >
            {this.t('remote_access.grant')}
          </dyte-button>
        </div>
      </Host>
    );
  }
}
