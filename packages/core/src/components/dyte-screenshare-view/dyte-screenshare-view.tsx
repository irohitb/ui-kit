import {
  Component,
  Host,
  h,
  Prop,
  Watch,
  State,
  writeTask,
  Element,
  Event,
  EventEmitter,
} from '@stencil/core';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import { Meeting, Peer, RemoteUpdatePayload, RemoteUpdateType } from '../../types/dyte-client';
import { Size, States } from '../../types/props';
import {
  exitFullSreen,
  isFullScreenEnabled,
  isFullScreenSupported,
  requestFullScreen,
} from '../../utils/full-screen';
import storeState from '../../lib/store';
import { DyteParticipant, DyteSelf } from '@dytesdk/web-core';

/**
 * A component which plays a participant's screenshared video.
 *
 * It also allows for placement of other components similar to `dyte-participant-tile`.
 *
 * This component will not render anything if the participant hasn't start screensharing.
 */
@Component({
  tag: 'dyte-screenshare-view',
  styleUrl: 'dyte-screenshare-view.css',
  shadow: true,
})
export class DyteScreenshareView {
  private videoEl: HTMLVideoElement;
  private screenShareListener: (
    data: Pick<Peer, 'screenShareEnabled' | 'screenShareTracks'>
  ) => void;

  private fullScreenListener = () => {
    this.isFullScreen = isFullScreenEnabled();
  };

  private participantScreenshareUpdate = (p: Peer) => {
    if (p.id !== this.participant.id) return;
    this.screenShareListener(p);
  };

  @Element() host: HTMLDyteScreenshareViewElement;

  /** Hide full screen button */
  @Prop() hideFullScreenButton: boolean = false;

  /** Position of name tag */
  @Prop({ reflect: true }) nameTagPosition:
    | 'bottom-left'
    | 'bottom-right'
    | 'bottom-center'
    | 'top-left'
    | 'top-right'
    | 'top-center' = 'bottom-left';

  /** Participant object */
  @Prop() participant!: Peer;

  /** Meeting object */
  @Prop() meeting: Meeting;

  /** Variant */
  @Prop({ reflect: true }) variant: 'solid' | 'gradient' = 'solid';

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  @State() videoExpanded: boolean = false;

  @State() screenShareEnabled: boolean = false;

  @State() isFullScreen: boolean = false;

  @State() remoteControlInfo: string;

  /** Emits updated state data */
  @Event({ eventName: 'dyteStateUpdate' }) stateUpdate: EventEmitter<States>;

  /** Emits when video playback happens successfully */
  @Event({ eventName: 'screensharePlay' }) play: EventEmitter<{
    participant: Peer;
    screenshareParticipant: Peer;
  }>;

  connectedCallback() {
    window?.addEventListener('fullscreenchange', this.fullScreenListener);
    window?.addEventListener('webkitfullscreenchange', this.fullScreenListener);
  }

  componentDidLoad() {
    this.participantChanged(this.participant);
  }

  disconnectedCallback() {
    const { self } = this.meeting;
    if (this.participant.id === self.id && this.screenShareListener)
      (this.participant as DyteParticipant).removeListener(
        'screenShareUpdate',
        this.screenShareListener
      );
    else
      this.meeting.participants.joined.removeListener(
        'screenShareUpdate',
        this.participantScreenshareUpdate
      );

    this.meeting?.remote?.removeListener('remoteUpdate', this.onRemoteUpdate);

    window?.removeEventListener('fullscreenchange', this.fullScreenListener);
    window?.removeEventListener('webkitfullscreenchange', this.fullScreenListener);
  }

  @Watch('participant')
  participantChanged(participant: Peer) {
    if (participant != null) {
      const { self } = this.meeting;
      this.screenShareListener = ({ screenShareEnabled, screenShareTracks }) => {
        const enabled = screenShareEnabled && screenShareTracks.video != null;

        writeTask(() => {
          this.screenShareEnabled = enabled;
        });

        if (enabled) {
          const stream = new MediaStream();
          stream.addTrack(screenShareTracks.video);
          if (this.videoEl != null) {
            this.videoEl.srcObject = stream;
            this.videoEl.play();
          }
        } else if (this.videoEl != null) {
          this.videoEl.srcObject = undefined;
        }
      };
      this.screenShareListener(participant);

      if (
        Boolean(this.meeting?.remote?.active) &&
        [this.meeting.remote.active.hostPeerId, this.meeting.remote.active.remotePeerId].includes(
          participant?.id
        )
      ) {
        this.onRemoteUpdate({
          payload: { request: this.meeting.remote.active },
          type:
            this.meeting.remote.active?.hostPeerId === this.meeting.self.id
              ? 'INCOMING_REQUEST_ACCEPTED'
              : 'OUTGOING_REQUEST_ACCEPTED',
        });
      }

      if (participant.id === self.id)
        (participant as DyteSelf).addListener('screenShareUpdate', this.screenShareListener);
      else
        this.meeting.participants.joined.addListener(
          'screenShareUpdate',
          this.participantScreenshareUpdate
        );
      this.meeting?.remote?.addListener('remoteUpdate', this.onRemoteUpdate);
    }
  }

  private onRemoteUpdate = ({ payload, type }: { payload: RemoteUpdatePayload; type: any }) => {
    let remoteControlInfo = '';
    if (type === RemoteUpdateType.INCOMING_REQUEST_ACCEPTED) {
      const remotePeer = this.meeting.participants.joined.get(payload.request.remotePeerId);
      remoteControlInfo = `${remotePeer.name} is controlling your screen.`;
    }
    if (type === RemoteUpdateType.OUTGOING_REQUEST_ACCEPTED) {
      const hostPeer = this.meeting.participants.joined.get(payload.request.hostPeerId);
      remoteControlInfo = `You are controlling ${hostPeer.name}'s screen.`;
    }
    if (
      type === RemoteUpdateType.INCOMING_REQUEST_ENDED ||
      type === RemoteUpdateType.OUTGOING_REQUEST_ENDED
    ) {
      remoteControlInfo = '';
    }
    if (type === RemoteUpdateType.REQUEST_RECEIVED && !Boolean(this.meeting?.remote?.active)) {
      this.stateUpdate.emit({ activeRemoteAccessManager: true });
      storeState.activeRemoteAccessManager = true;
    }
    this.remoteControlInfo = remoteControlInfo;
  };

  private shouldSkipEventTrigger() {
    if (this.meeting == null || this.participant == null) return true;

    return (
      !Boolean(this.meeting.remote?.active) ||
      // It is you, who is moving over your own shared screen
      !Boolean(this.meeting.participants.joined.get(this.meeting.remote?.active.hostPeerId)) ||
      // Skip nonactive screenshare events, Redundant check
      this.meeting.remote?.active.hostPeerId != this.participant.id
    );
  }

  private onMouseEvent = (event: MouseEvent) => {
    if (this.shouldSkipEventTrigger()) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    this.meeting?.remote?.mouseEvent(event, this.videoEl);
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.shouldSkipEventTrigger()) {
      return;
    }

    this.meeting?.remote?.keyboardEvent(event);
  };

  private toggleFullScreen = () => {
    if (!this.isFullScreen) {
      requestFullScreen(this.host);
      this.isFullScreen = true;
    } else {
      exitFullSreen();
      this.isFullScreen = false;
    }
  };

  render() {
    const isSelf = this.participant?.id === this.meeting?.self.id;

    const text = this.isFullScreen ? this.t('full_screen.exit') : this.t('full_screen');
    const icon = this.isFullScreen
      ? this.iconPack.full_screen_minimize
      : this.iconPack.full_screen_maximize;

    return (
      <Host class={{ isSelf }}>
        {/* Remote control status */}
        {Boolean(this.meeting?.remote?.active && this.remoteControlInfo) && (
          <div id="remote-control-self" key="remote-control-self">
            <p class="remote-control-message">{this.remoteControlInfo}</p>
            <dyte-button
              onClick={() => this.meeting.remote?.endControl()}
              iconPack={this.iconPack}
              t={this.t}
            >
              {this.meeting.remote?.active?.hostPeerId === this.meeting.self.id
                ? 'Revoke access'
                : 'Stop'}
            </dyte-button>
          </div>
        )}

        <div
          key="video-container"
          id="video-container"
          class={{ expand: this.videoExpanded }}
          contentEditable={Boolean(this.meeting.remote?.active)}
          onKeyDown={this.onKeyDown}
        >
          <video
            ref={(el) => (this.videoEl = el)}
            class={{
              visible: this.screenShareEnabled,
              'fit-in-container': this.participant.supportsRemoteControl,
            }}
            playsInline
            onPlay={() => {
              this.play.emit({
                screenshareParticipant: this.participant,
                participant: this.meeting.self,
              });
            }}
            autoPlay
            muted
            id={`screen-share-video-${this.participant.id}`}
            onMouseMove={this.onMouseEvent}
            onClick={this.onMouseEvent}
            onContextMenu={this.onMouseEvent}
          />
        </div>

        {/* Screen share controls */}
        <div id="controls" key="controls">
          {/* Full screen button */}
          {!this.hideFullScreenButton && !isSelf && isFullScreenSupported() && (
            <dyte-tooltip label={text} iconPack={this.iconPack} t={this.t}>
              <dyte-button
                id="full-screen-btn"
                kind="icon"
                onClick={this.toggleFullScreen}
                title={text}
                iconPack={this.iconPack}
                t={this.t}
              >
                <dyte-icon
                  icon={icon}
                  aria-hidden={true}
                  tabIndex={-1}
                  iconPack={this.iconPack}
                  t={this.t}
                />
              </dyte-button>
            </dyte-tooltip>
          )}

          {/* Only show menu when participant system supports remote access control */}
          {this.participant?.supportsRemoteControl === true && (
            <dyte-menu id="menu" key="menu" iconPack={this.iconPack} t={this.t}>
              <dyte-button
                variant="secondary"
                kind="icon"
                slot="trigger"
                iconPack={this.iconPack}
                t={this.t}
              >
                <dyte-icon icon={this.iconPack.more_vertical} iconPack={this.iconPack} t={this.t} />
              </dyte-button>
              <dyte-menu-list iconPack={this.iconPack} t={this.t}>
                {!isSelf && (
                  <dyte-menu-item
                    style={{
                      cursor: this.participant.supportsRemoteControl ? 'pointer' : 'not-allowed',
                    }}
                    iconPack={this.iconPack}
                    t={this.t}
                    onClick={() => {
                      if (this.participant?.supportsRemoteControl) {
                        this.meeting.remote?.requestControl(this.participant.id);
                      }
                    }}
                  >
                    Request remote control
                  </dyte-menu-item>
                )}
                {isSelf && (
                  <dyte-menu-item
                    iconPack={this.iconPack}
                    t={this.t}
                    onClick={() => this.stateUpdate.emit({ activeRemoteAccessManager: true })}
                  >
                    Manage remote control requests
                  </dyte-menu-item>
                )}
              </dyte-menu-list>
            </dyte-menu>
          )}
        </div>

        {/* Self screen share view */}
        {isSelf && (
          <div id="self-message" key="self-message">
            <h3>{this.t('screenshare.shared')}</h3>
            <div class="actions">
              {this.meeting != null && (
                <dyte-button
                  variant="danger"
                  onClick={() => {
                    this.meeting.self.disableScreenShare();
                  }}
                  iconPack={this.iconPack}
                  t={this.t}
                >
                  <dyte-icon
                    icon={this.iconPack.share_screen_stop}
                    slot="start"
                    iconPack={this.iconPack}
                    t={this.t}
                  />
                  {this.t('screenshare.stop')}
                </dyte-button>
              )}
              <dyte-button
                variant="secondary"
                id="expand-btn"
                iconPack={this.iconPack}
                t={this.t}
                onClick={() => {
                  this.videoExpanded = !this.videoExpanded;
                }}
              >
                <dyte-icon
                  icon={
                    this.videoExpanded
                      ? this.iconPack.full_screen_minimize
                      : this.iconPack.full_screen_maximize
                  }
                  slot="start"
                  iconPack={this.iconPack}
                  t={this.t}
                />
                {this.videoExpanded
                  ? this.t('screenshare.min_preview')
                  : this.t('screenshare.max_preview')}
              </dyte-button>
            </div>
          </div>
        )}
        <slot />
      </Host>
    );
  }
}
