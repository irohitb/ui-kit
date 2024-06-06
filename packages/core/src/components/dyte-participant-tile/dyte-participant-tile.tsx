import {
  Component,
  Host,
  h,
  Prop,
  Watch,
  State,
  Event,
  EventEmitter,
  forceUpdate,
} from '@stencil/core';
import storeState, { onChange } from '../../lib/store';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import { Meeting, Peer } from '../../types/dyte-client';
import { Size, States } from '../../types/props';
import { UIConfig } from '../../types/ui-config';
import { FlagsmithFeatureFlags } from '../../utils/flags';
import { defaultConfig } from '../../exports';
import { DefaultProps, Render } from '../../lib/render';
import { DyteParticipant } from '@dytesdk/web-core';

export type VideoState = Pick<Peer, 'videoEnabled' | 'videoTrack'>;

/**
 * A component which plays a participants video and allows for placement
 * of components like `dyte-name-tag`, `dyte-audio-visualizer` or any other component.
 */
@Component({
  tag: 'dyte-participant-tile',
  styleUrl: 'dyte-participant-tile.css',
  shadow: true,
})
export class DyteParticipantTile {
  private videoEl: HTMLVideoElement;

  private removeStateChangeListener: () => void;

  private playTimeout: any;

  @State() videoState: VideoState;

  @State() isPinned: boolean = false;

  /** Position of name tag */
  @Prop({ reflect: true }) nameTagPosition:
    | 'bottom-left'
    | 'bottom-right'
    | 'bottom-center'
    | 'top-left'
    | 'top-right'
    | 'top-center' = 'bottom-left';

  /** Whether tile is used for preview */
  @Prop() isPreview: boolean = false;

  /** Participant object */
  @Prop() participant!: Peer;

  /** Meeting object */
  @Prop() meeting: Meeting;

  /** States object */
  @Prop() states: States;

  /** Config object */
  @Prop() config: UIConfig = defaultConfig;

  /** Variant */
  @Prop({ reflect: true }) variant: 'solid' | 'gradient' = 'solid';

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  /** Event triggered when tile is loaded */
  @Event() tileLoad: EventEmitter<{ participant: Peer; videoElement: HTMLVideoElement }>;

  /** Event triggered when tile is unloaded */
  @Event() tileUnload: EventEmitter<Peer>;

  private onVideoRef(el: HTMLVideoElement) {
    this.videoEl = el;
    if (this.isPreview || this.participant == null || this.meeting == null) {
      return;
    }

    this.tileLoad.emit({ participant: this.participant, videoElement: this.videoEl });
  }

  connectedCallback() {
    // set videoState before initial render and initialize listeners
    if (this.meeting) this.meetingChanged(this.meeting);
    else this.participantsChanged(this.participant);
    if (this.states === undefined) {
      // This re-renders on any pref change
      // There are currently only two prefs, so it is fine
      // Could not find a way to subscribe to a nested property
      this.removeStateChangeListener = onChange('prefs', () => forceUpdate(this));
    }
  }

  componentDidLoad() {
    // load videoState into video element after first render
    this.videoStateChanged(this.videoState);
  }

  disconnectedCallback() {
    if (this.playTimeout) clearTimeout(this.playTimeout);
    if (this.participant == null) return;

    (this.participant as DyteParticipant).removeListener('videoUpdate', this.onVideoUpdate);
    (this.participant as DyteParticipant).removeListener('pinned', this.onPinned);
    (this.participant as DyteParticipant).removeListener('unpinned', this.onPinned);
    this.tileUnload.emit(this.participant);
    this.removeStateChangeListener && this.removeStateChangeListener();
  }

  @Watch('meeting')
  meetingChanged(meeting: Meeting) {
    if (meeting == undefined) return;
    this.participantsChanged(this.participant);
  }

  @Watch('participant')
  participantsChanged(participant: Peer) {
    if (participant == undefined) return;

    this.videoState = {
      videoEnabled: participant.videoEnabled,
      videoTrack: participant.videoTrack,
    };

    if (this.meeting === undefined) {
      if (this.isPreview) {
        (participant as DyteParticipant).addListener('videoUpdate', this.onVideoUpdate);
      }
      return;
    }

    this.isPinned = participant.isPinned;

    (participant as DyteParticipant).addListener('videoUpdate', this.onVideoUpdate);

    (participant as DyteParticipant).addListener('pinned', this.onPinned);
    (participant as DyteParticipant).addListener('unpinned', this.onPinned);
  }

  @Watch('videoState')
  videoStateChanged(videoState: VideoState) {
    if (videoState != null && this.videoEl != null) {
      if (videoState.videoEnabled) {
        if (
          this.meeting?.__internals__.features.hasFeature(
            FlagsmithFeatureFlags.LOG_PLAYING_FAILURES
          )
        ) {
          if (this.playTimeout) clearTimeout(this.playTimeout);
          this.playTimeout = setTimeout(() => {
            this.meeting?.__internals__.logger.log('dyte-participant-tile::playing_timeout');
          }, 6000);
        }
        const stream = new MediaStream();
        if (videoState.videoTrack == null) return;
        stream.addTrack(videoState.videoTrack);
        this.videoEl.srcObject = stream;
      } else {
        if (this.playTimeout) clearTimeout(this.playTimeout);
        this.videoEl.srcObject = undefined;
      }
    }
  }

  private onVideoUpdate = (videoState: VideoState) => {
    this.videoState = videoState;
  };

  private onPinned = ({ isPinned }: Peer) => {
    this.isPinned = isPinned;
  };

  private isSelf = () => this.isPreview || this.participant.id === this.meeting?.self.id;

  private isMirrored() {
    if (this.participant != null) {
      if (this.isSelf()) {
        const states = this.states || storeState;
        const mirrorVideo = states?.prefs?.mirrorVideo;
        if (typeof mirrorVideo === 'boolean') {
          return mirrorVideo;
        }
      }
    }
    return false;
  }

  private onPause = (event) => {
    if (
      this.isSelf() &&
      this.meeting?.__internals__.features.hasFeature(
        FlagsmithFeatureFlags.PLAY_PARTICIPANT_TILE_VIDEO_ON_PAUSE
      )
    ) {
      this.meeting.__internals__.logger.warn(
        `Video player paused for ${this.participant.id} isSelf: ${this.isSelf()}`
      );
      // @ts-ignore
      event?.target?.play();
    }
  };
  private onPlaying = () => {
    if (this.playTimeout) clearTimeout(this.playTimeout);
  };

  render() {
    const defaults: DefaultProps = {
      meeting: this.meeting,
      size: this.size,
      states: this.states || storeState,
      config: this.config,
      iconPack: this.iconPack,
      t: this.t,
    };

    return (
      <Host class={{ hideAvatar: this.videoState.videoEnabled }}>
        <video
          ref={(el) => this.onVideoRef(el)}
          class={{
            visible: this.videoState?.videoEnabled,
            mirror: this.isMirrored(),
            [this.config?.config?.videoFit ?? 'cover']: true,
          }}
          onPlaying={this.onPlaying}
          onPause={this.onPause}
          autoPlay
          playsInline
          muted
          part="video"
        />
        {this.isPinned && (
          <dyte-icon
            class="pinned-icon"
            icon={this.iconPack.pin}
            aria-label={this.t('pinned')}
            iconPack={this.iconPack}
            t={this.t}
            part="pinned-icon"
          />
        )}

        <slot>
          <Render
            element="dyte-participant-tile"
            defaults={defaults}
            childProps={{
              participant: this.participant,
            }}
            deepProps
            onlyChildren
          />
        </slot>
      </Host>
    );
  }
}