import {
  Component,
  h,
  State,
  Element,
  Listen,
  Prop,
  Watch,
  Event,
  EventEmitter,
} from '@stencil/core';
import deepMerge from 'lodash-es/merge';
import { PermissionSettings, Size, States } from '../../types/props';
import { getSize } from '../../utils/size';
import { Meeting, RoomLeftState } from '../../types/dyte-client';
import { DyteI18n, useLanguage } from '../../lib/lang';
import { defaultIconPack, getIconPack, IconPack } from '../../lib/icons';
import { UIConfig } from '../../types/ui-config';
import { defaultConfig } from '../../lib/default-ui-config';
import { Render } from '../../lib/render';
import { provideDyteDesignSystem } from '../../index';
import { getUserPreferences } from '../../utils/user-prefs';
import { generateConfig } from '../../utils/config';
import storeState from '../../lib/store';
import { GridLayout } from '../dyte-grid/dyte-grid';
import ResizeObserver from 'resize-observer-polyfill';

export type MeetingMode = 'fixed' | 'fill';

/**
 * A single component which renders an entire meeting UI.
 *
 * It loads your preset and renders the UI based on it.
 * With this component, you don't have to handle all the states,
 * dialogs and other smaller bits of managing the application.
 */
@Component({
  tag: 'dyte-meeting',
  styleUrl: 'dyte-meeting.css',
  shadow: true,
})
export class DyteMeeting {
  private resizeObserver: ResizeObserver;

  private roomJoinedListener = () => {
    this.setStates({ meeting: 'joined' });
    storeState.meeting = 'joined';
  };

  private socketServiceRoomJoinedListener = () => {
    if (this.meeting.stage.status === 'ON_STAGE' || this.meeting.stage.status === undefined) return;
    this.setStates({ meeting: 'joined' });
    storeState.meeting = 'joined';
  };

  private waitlistedListener = () => {
    this.setStates({ meeting: 'waiting' });
    storeState.meeting = 'waiting';
  };

  private roomLeftListener = ({ state }: { state: RoomLeftState }) => {
    const states = this.states || storeState;
    if (states?.roomLeftState === 'disconnected') {
      this.setStates({ meeting: 'ended', roomLeftState: state });
      storeState.meeting = 'ended';
      return;
    }
    this.setStates({ meeting: 'ended', roomLeftState: state });
    storeState.meeting = 'ended';
    storeState.roomLeftState = state;
  };

  private mediaPermissionUpdateListener = ({ kind, message }) => {
    if (['audio', 'video'].includes(kind)) {
      if (message === 'ACCEPTED' || message === 'NOT_REQUESTED' || storeState.activeDebugger)
        return;
      const permissionModalSettings: PermissionSettings = {
        enabled: true,
        kind,
      };
      this.setStates({ activePermissionsMessage: permissionModalSettings });
      storeState.activePermissionsMessage = permissionModalSettings;
    }
  };

  private joinStateAcceptedListener = () => {
    this.setStates({ activeJoinStage: true });
    this.stateUpdate.emit({ activeJoinStage: true });
    storeState.activeJoinStage = true;
  };

  @Element() host: HTMLDyteMeetingElement;

  /** Whether to load config from preset */
  @Prop() loadConfigFromPreset: boolean = true;

  /** Whether to apply the design system on the document root from config */
  @Prop() applyDesignSystem: boolean = true;

  /** Fill type */
  @Prop({ reflect: true }) mode: MeetingMode = 'fixed';

  /** Whether participant should leave when this component gets unmounted */
  @Prop() leaveOnUnmount = false;

  /** Meeting object */
  @Prop() meeting: Meeting;

  /** Whether to show setup screen or not */
  @Prop({ mutable: true }) showSetupScreen: boolean;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  /** UI Config */
  @Prop({ mutable: true }) config: UIConfig = defaultConfig;

  /** Icon Pack URL */
  @Prop({ reflect: true }) iconPackUrl: string;

  /** Size */
  @Prop({ reflect: true, mutable: true }) size: Size;

  /** Grid layout */
  @Prop() gridLayout: GridLayout = 'row';

  @State() states: States = {
    meeting: 'idle',
    prefs: getUserPreferences(),
  };

  @State() iconPack: IconPack = defaultIconPack;

  /** Emits updated state data */
  @Event({ eventName: 'dyteStateUpdate' }) stateUpdate: EventEmitter<Partial<States>>;

  connectedCallback() {
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.host);
    if (
      this.applyDesignSystem &&
      this.config?.designTokens != null &&
      typeof document !== 'undefined'
    ) {
      provideDyteDesignSystem(document.documentElement, this.config.designTokens);
    }
    this.meetingChanged(this.meeting);
    this.iconPackUrlChanged(this.iconPackUrl);
  }

  private clearListeners(meeting: Meeting) {
    if (meeting == undefined) return;
    meeting.self.removeListener('roomJoined', this.roomJoinedListener);
    meeting.self.removeListener('socketServiceRoomJoined', this.roomJoinedListener);
    meeting.meta.removeListener('socketReconnected', this.roomJoinedListener);
    meeting.self.removeListener('roomLeft', this.roomLeftListener);
    meeting.self.removeListener('mediaPermissionUpdate', this.mediaPermissionUpdateListener);
    meeting.self.removeListener('waitlisted', this.waitlistedListener);
    meeting.self.removeListener('joinStageRequestAccepted', this.joinStateAcceptedListener);
  }

  disconnectedCallback() {
    if (this.leaveOnUnmount) {
      this.meeting?.leaveRoom();
    }
    this.resizeObserver.disconnect();
    this.clearListeners(this.meeting);
  }

  @Watch('meeting')
  meetingChanged(meeting: Meeting) {
    if (meeting == null) return;

    this.setStates({ viewType: meeting.meta.viewType });

    if (this.loadConfigFromPreset && meeting.self.config != null) {
      const theme = meeting.self.config;
      const { config, data } = generateConfig(theme, meeting);

      if (this.config === defaultConfig) {
        // only override the config if the object is same as defaultConfig
        // which means it's a different object passed via prop
        this.config = config;
      }
      if (this.showSetupScreen == null) {
        // only override this value if the prop isn't passed
        this.showSetupScreen = data.showSetupScreen;
      }

      if (
        meeting.connectedMeetings.supportsConnectedMeetings &&
        storeState.activeBreakoutRoomsManager?.destinationMeetingId
      ) {
        this.showSetupScreen = false;
      }
    }

    if (
      this.applyDesignSystem &&
      this.config?.designTokens != null &&
      typeof document !== 'undefined'
    ) {
      provideDyteDesignSystem(document.documentElement, this.config.designTokens);
    }
    if (meeting.meta.viewType === 'LIVESTREAM') {
      meeting.self.addListener('socketServiceRoomJoined', this.socketServiceRoomJoinedListener);
    }
    meeting.self.addListener('roomJoined', this.roomJoinedListener);

    meeting.self.addListener('waitlisted', this.waitlistedListener);
    meeting.self.addListener('roomLeft', this.roomLeftListener);
    meeting.self.addListener('mediaPermissionUpdate', this.mediaPermissionUpdateListener);
    meeting.self.addListener('joinStageRequestAccepted', this.joinStateAcceptedListener);

    if (meeting.connectedMeetings.supportsConnectedMeetings) {
      meeting.connectedMeetings.once('changingMeeting', this.handleChangingMeeting);
    }

    if (meeting.self.roomJoined) {
      this.states = { ...this.states, meeting: 'joined' };
      storeState.meeting = 'joined';
    } else {
      if (this.showSetupScreen) {
        this.states = { ...this.states, meeting: 'setup' };
        storeState.meeting = 'setup';
      } else {
        // join directly to the meeting
        meeting.joinRoom();
      }
    }
  }

  @Watch('iconPackUrl')
  async iconPackUrlChanged(url: string) {
    this.iconPack = await getIconPack(url);
  }

  @Listen('dyteStateUpdate')
  listenState(e: CustomEvent<States>) {
    e.stopPropagation();
    this.setStates(e.detail);
  }

  private handleChangingMeeting(destinationMeetingId: string) {
    storeState.activeBreakoutRoomsManager = {
      ...storeState.activeBreakoutRoomsManager,
      destinationMeetingId,
    };
  }

  private handleResize() {
    this.size = getSize(this.host.clientWidth);
  }

  private setStates(states: Partial<States>) {
    const newStates = Object.assign({}, this.states);
    deepMerge(newStates, states);
    this.states = newStates;
  }

  render() {
    const defaults = {
      meeting: this.meeting,
      size: this.size,
      states: this.states || storeState,
      config: this.config,
      iconPack: this.iconPack,
      t: this.t,
    };

    const elementProps = {
      'dyte-grid': {
        layout: this.gridLayout,
      },
    };

    if (this.meeting?.meta?.viewType === 'CHAT')
      return <Render element="dyte-chat" defaults={defaults} />;
    return <Render element="dyte-meeting" defaults={defaults} asHost elementProps={elementProps} />;
  }
}
