import { Component, Host, h, Prop, State, Element, Watch, writeTask, Listen } from '@stencil/core';
import {
  Meeting,
  Participant,
  Peer,
  RemoteUpdateType,
  RemoteUpdatePayload,
  WaitlistedParticipant,
} from '../../types/dyte-client';
import { Size, Notification, States, Poll, SocketEvents } from '../../types/props';
import DyteNotificationsAudio, { Sound } from '../../lib/notification';
import { formatName } from '../../utils/string';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import { UIConfig } from '../../types/ui-config';
import {
  Config,
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_NOTIFICATION_DURATION,
  NotificationConfig,
  NotificationSoundsType,
} from '../../types/ui-config/config';
import type { ActiveTab, RecordingState, ChatUpdateParams } from '@dytesdk/web-core';
import { defaultConfig } from '../../exports';
import { parseMessageForTarget } from '../../utils/chat';
import { showLivestream } from '../../utils/livestream';

function parseConfig(config: Config) {
  const permissions: NotificationConfig = Object.assign({}, DEFAULT_NOTIFICATION_CONFIG);

  if (config == null) return permissions;

  Object.assign(permissions.notification_sounds, config.notification_sounds);
  Object.assign(permissions.notifications, config.notifications);
  Object.assign(permissions.notification_duration, config.notification_duration);

  permissions.participant_chat_message_sound_notification_limit =
    config.participant_chat_message_sound_notification_limit;

  permissions.participant_joined_sound_notification_limit =
    config.participant_joined_sound_notification_limit;

  return permissions;
}

function getEnabledSounds(sounds: Partial<NotificationSoundsType>) {
  return Object.keys(sounds).filter((key) => sounds[key]);
}

/**
 * A component which handles notifications.
 *
 * You can configure which notifications you want to see and which ones you want to hear.
 * There are also certain limits which you can set as well.
 */
@Component({
  tag: 'dyte-notifications',
  styleUrl: 'dyte-notifications.css',
  shadow: true,
})
export class DyteNotifications {
  private audio: DyteNotificationsAudio;

  private permissions: NotificationConfig = DEFAULT_NOTIFICATION_CONFIG;
  private enabledSounds: string[] = getEnabledSounds(
    DEFAULT_NOTIFICATION_CONFIG.notification_sounds
  );

  private participantJoinedListener: (participant: Peer) => void;
  private participantLeftListener: (participant: Peer) => void;
  private waitlistedParticipantJoinedListener: (participant: WaitlistedParticipant) => void;
  private chatUpdateListener: (data: ChatUpdateParams) => void;
  private pollUpdateListener: ({ polls }: { polls: Poll[]; newPoll: boolean }) => void;
  private deviceUpdateListener: (data: { device: MediaDeviceInfo; preview: boolean }) => void;
  private networkConnectedListener: () => void;
  private networkDisconnectedListener: () => void;
  private socketUpdateListener: (data: { event: SocketEvents; attempt?: number }) => void;
  private socketReconnectedListener: () => void;
  private socketDisconnectedListener: () => void;
  private socketReconnectingListener: () => void;
  private socketFailureListener: () => void;
  private socketReconnectFailureListener: (data: { attempt: number }) => void;
  private activeTabUpdateListener: (spotlightTab: ActiveTab) => void;
  private peerStageStatusListener: (participant: Peer) => void;
  private stageRequestAccepted: () => void;
  private stageRequestRejected: () => void;
  private newStageRequests: (data: { count: number }) => void;
  private stageStatusUpdateListener: (status: string) => void;
  private disconnectTimeout: NodeJS.Timeout;

  @Element() host: HTMLDyteNotificationsElement;

  /** Meeting object */
  @Prop() meeting!: Meeting;

  /** States object */
  @Prop() states: States;

  /** Config object */
  @Prop() config: UIConfig = defaultConfig;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  @State() notifications: Notification[] = [];

  connectedCallback() {
    if (typeof document !== 'undefined') {
      document?.addEventListener('dyteNotification', this.onDyteNotification);
    }
    this.meetingChanged(this.meeting);
    this.configChanged(this.config);
    this.statesChanged(this.states);
  }

  private clearListeners(meeting: Meeting) {
    const isLivestream = meeting.meta.viewType === 'LIVESTREAM';

    if ((isLivestream && meeting.stage?.status === 'ON_STAGE') || !isLivestream) {
      this.removeStagePeersListeners(meeting);
    }
    this.chatUpdateListener && meeting.chat?.removeListener('chatUpdate', this.chatUpdateListener);
    this.pollUpdateListener &&
      meeting.polls?.removeListener('pollsUpdate', this.pollUpdateListener);
    this.socketDisconnectedListener &&
      meeting.meta.removeListener('socketDisconnected', this.socketDisconnectedListener);
    this.socketReconnectFailureListener &&
      meeting.meta.removeListener('socketReconnectFailure', this.socketReconnectFailureListener);
    this.socketReconnectedListener &&
      meeting.meta.removeListener('socketReconnected', this.socketReconnectedListener);
    this.socketReconnectingListener &&
      meeting.meta.removeListener('socketReconnecting', this.socketReconnectingListener);
    this.socketFailureListener &&
      meeting.meta.removeListener('socketFailure', this.socketFailureListener);
    this.stageRequestAccepted &&
      meeting.stage?.removeListener('stageRequestApproved', this.stageRequestAccepted);
    this.stageRequestRejected &&
      meeting.stage?.removeListener('stageRequestRejected', this.stageRequestRejected);
    this.newStageRequests &&
      meeting.stage?.removeListener('newStageRequest', this.newStageRequests);
    this.stageStatusUpdateListener &&
      meeting.stage?.removeListener('stageStatusUpdate', this.stageStatusUpdateListener);
    meeting.remote?.removeListener('remoteUpdate', this.onRemoteUpdate);
    meeting.recording?.removeListener('recordingUpdate', this.onRecordingUpdate);
    clearTimeout(this.disconnectTimeout);
    meeting.self.removeListener('deviceUpdate', this.deviceUpdateListener);
  }

  disconnectedCallback() {
    if (typeof document !== 'undefined') {
      document?.removeEventListener('dyteNotification', this.onDyteNotification);
    }

    if (this.meeting == null) return;
    this.clearListeners(this.meeting);
    this.waitlistedParticipantJoinedListener &&
      this.meeting.participants.waitlisted.removeListener(
        'participantJoined',
        this.waitlistedParticipantJoinedListener
      );

    this.activeTabUpdateListener &&
      this.meeting.meta?.removeListener('activeTabUpdate', this.activeTabUpdateListener);
    this.peerStageStatusListener &&
      this.meeting.participants.joined.removeListener(
        'stageStatusUpdate',
        this.peerStageStatusListener
      );
  }

  @Watch('meeting')
  meetingChanged(meeting: Meeting, oldMeeting?: Meeting) {
    clearTimeout(this.disconnectTimeout);
    if (oldMeeting !== undefined) this.clearListeners(oldMeeting);
    if (meeting == null) return;
    const isLivestream = meeting.meta.viewType === 'LIVESTREAM';
    this.audio = new DyteNotificationsAudio(meeting);
    const { notifications, notification_duration, notification_sounds } = this.permissions;
    this.participantJoinedListener = (participant: Participant) => {
      if (notifications.participant_joined) {
        this.add({
          id: `${participant.id}-joined`,
          message: `${formatName(participant.name)} ${this.t('notifications.joined')}`,
          image: participant.picture,
          duration: notification_duration.participant_joined,
        });
      }
      if (notification_sounds.participant_joined && this.canPlayParticipantJoinedSound()) {
        this.audio.play('joined');
      }
    };

    this.participantLeftListener = (participant: Participant) => {
      if (notifications.participant_left) {
        this.add({
          id: `${participant.id}-left`,
          message: `${formatName(participant.name)} ${this.t('notifications.left')}`,
          image: participant.picture,
          duration: notification_duration.participant_left,
        });
      }
      if (notification_sounds.participant_left && this.canPlayParticipantJoinedSound()) {
        this.audio.play('left');
      }
    };

    this.waitlistedParticipantJoinedListener = (participant: WaitlistedParticipant) => {
      if (!this.canAcceptWaitingRequests()) return;
      const id = `${participant.id}-joined-waitlist`;
      this.add({
        id,
        message: `${formatName(participant.name)} ${this.t(
          'notifications.requesting_to_join_meeting'
        )}`,
        image: participant.picture,
        duration: notification_duration.participant_joined_waitlist,
        button: {
          text: this.t('notifications.accept'),
          variant: 'primary',
          onClick: async () => {
            await this.meeting.participants.acceptWaitingRoomRequest(participant.id);
            this.remove(id);
          },
        },
      });
      if (notification_sounds.participant_joined_waitlist && this.canPlayParticipantJoinedSound()) {
        this.audio.play('message');
      }
    };

    this.chatUpdateListener = ({ message }) => {
      const parsedMessage = parseMessageForTarget(message);
      if (parsedMessage != null) {
        if (parsedMessage.userId === meeting.self.userId) {
          return;
        }
        if (parsedMessage.type === 'text') {
          if (notifications.chat) {
            this.add({
              id: `message-${Math.random().toString(36)}`,
              icon: this.iconPack.chat,
              message: `${parsedMessage.displayName}: ${parsedMessage.message}`,
              duration: notification_duration.chat,
            });
          }
          if (notification_sounds.chat && this.canPlayChatSound()) {
            this.audio.play('message');
          }
        }
      }
    };

    this.pollUpdateListener = ({ polls, newPoll }) => {
      if (newPoll === false) return;
      if (
        notifications.polls &&
        this.meeting.self.userId !== polls[polls.length - 1].createdByUserId
      ) {
        this.add({
          id: `poll-${Math.random().toString(36)}`,
          icon: this.iconPack.poll,
          message: `${this.t('notifications.new_poll_created_by')} ${
            polls[polls.length - 1].createdBy
          }`,
          duration: notification_duration.polls,
        });
      }
      if (
        notification_sounds.polls &&
        this.meeting.self.userId !== polls[polls.length - 1].createdByUserId &&
        this.canPlayChatSound()
      ) {
        this.audio.play('message');
      }
    };

    this.deviceUpdateListener = ({ device, preview }) => {
      if (preview) return;
      if (device.kind === 'audiooutput') {
        this.audio.setDevice(device.deviceId);
        this.remove(`speaker-switched`);
        this.add({
          id: `speaker-switched`,
          message: `${this.t('notifications.connected_to')} ${device.label}`,
          icon: this.iconPack.speaker,
          duration: 5000,
        });
      }
      if (device.kind === 'videoinput') {
        this.remove(`camera-switched`);
        this.add({
          id: `camera-switched`,
          message: `${this.t('notifications.connected_to')} ${device.label}`,
          icon: this.meeting.self.videoEnabled ? this.iconPack.video_on : this.iconPack.video_off,
          iconVariant: this.meeting.self.videoEnabled ? 'primary' : 'danger',
          duration: 5000,
        });
      }
      if (device.kind === 'audioinput') {
        this.remove(`mic-switched`);
        this.add({
          id: `mic-switched`,
          message: `${this.t('notifications.connected_to')} ${device.label}`,
          icon: this.meeting.self.audioEnabled ? this.iconPack.mic_on : this.iconPack.mic_off,
          iconVariant: this.meeting.self.audioEnabled ? 'primary' : 'danger',
          duration: 5000,
        });
      }
    };

    this.networkDisconnectedListener = () => {
      this.remove('network');
      let reconnectDuration: number;
      reconnectDuration = 20000;
      this.add({
        id: 'network',
        icon: this.iconPack.disconnected,
        message: this.t('network.reconnecting'),
        duration: reconnectDuration,
      });
      this.disconnectTimeout = setTimeout(() => {
        this.add({
          id: 'network-lost',
          icon: this.iconPack.disconnected,
          message: this.t('network.delay'),
          button: {
            text: this.t('end'),
            variant: 'danger',
            onClick: () => this.meeting?.leaveRoom(),
          },
        });
      }, reconnectDuration);
    };

    this.networkConnectedListener = () => {
      this.remove('network');
      let reconnectDuration: number;
      this.remove('network-lost');
      reconnectDuration = 3000;
      this.add({
        id: `network`,
        icon: this.iconPack.wifi,
        message: this.t('network.restored'),
        duration: reconnectDuration,
      });
      clearTimeout(this.disconnectTimeout);
    };

    this.socketUpdateListener = ({ event, attempt }) => {
      this.remove('socket');
      if (event === 'reconnected') {
        this.remove('socketReconnecting');
        this.add({
          id: `socket`,
          icon: this.iconPack.wifi,
          message: this.t('network.restored'),
          duration: 3000,
        });
      } else if (event === 'disconnected') {
        this.add({
          id: 'socket',
          icon: this.iconPack.disconnected,
          message: this.t('network.lost'),
          duration: 3000,
        });
      } else if (event === 'reconnecting') {
        this.add({
          id: 'socketReconnecting',
          icon: this.iconPack.disconnected,
          message: this.t('network.lost_extended'),
        });
      } else if (event === 'reconnectFailure') {
        if (attempt > 5) {
          this.remove('socketReconnecting');
          this.add({
            id: 'socketReconnecting',
            icon: this.iconPack.disconnected,
            message: this.t('network.delay_extended'),
            button: {
              text: this.t('end'),
              variant: 'danger',
              onClick: () => this.meeting?.leaveRoom(),
            },
          });
        }
      } else if (event === 'failed') {
        this.remove('socketReconnecting');
        this.add({
          id: 'socketFailed',
          icon: this.iconPack.disconnected,
          message: this.t('network.disconnected'),
        });
        this.add({
          id: 'leaveMeeting',
          icon: this.iconPack.warning,
          message: this.t('network.leaving'),
        });
        setTimeout(() => {
          this.meeting?.leaveRoom('disconnected');
        }, 10000);
      }
    };

    this.activeTabUpdateListener = (activeTab) => {
      if (!notifications.tab_sync) return;
      switch (activeTab.type) {
        case 'plugin':
          const activePlugin = meeting.plugins.active
            .toArray()
            .find((plugin) => plugin.id == activeTab.id);

          if (activePlugin != undefined) {
            this.add({
              id: 'activeTab',
              message: `${this.t('notifications.plugin_switched_to')} ${activePlugin.name}`,
              duration: notification_duration.participant_joined,
            });
          }
          break;
        case 'screenshare':
          const screenShareParticipant = meeting.participants.joined
            .toArray()
            .filter((participant) => participant.screenShareEnabled)
            .find((participant) => participant.id == activeTab.id);

          if (screenShareParticipant != undefined) {
            this.add({
              id: 'spotlight',
              message: `Now watching ${screenShareParticipant.name}'s screen`,
              duration: notification_duration.webinar,
            });
          }
          break;
      }
    };

    this.peerStageStatusListener = (participant: Peer) => {
      if (participant.stageStatus === 'REQUESTED_TO_JOIN_STAGE') {
        this.add({
          id: `stage-request-${participant.id}`,
          message: `${participant.name} ${this.t('notifications.requested_to_join_stage')}`,
          duration: notification_duration.webinar,
          button: {
            text: this.t('notifications.accept'),
            variant: 'primary',
            onClick: async () => {
              await this.meeting.stage.grantAccess([participant.userId]);
              this.remove(`stage-request-${participant.id}`);
            },
          },
        });
        if (notification_sounds.webinar) {
          this.audio.play('joined');
        }
      }
      if (participant.stageStatus === 'ON_STAGE') {
        this.add({
          id: `stage-joined-${participant.id}`,
          message: `${participant.name} ${this.t('notifications.joined_stage')}`,
          duration: notification_duration.webinar,
        });
        if (notification_sounds.webinar) {
          this.audio.play('joined');
        }
      }
    };

    this.stageRequestAccepted = () => {
      this.add({
        id: 'stage-request-accepted',
        message: this.t('notifications.request_to_join_accepted'),
        duration: 3000,
      });
    };

    this.stageRequestRejected = () => {
      this.add({
        id: 'stage-request-rejected',
        message: this.t('notifications.request_to_join_rejected'),
        duration: 3000,
      });
    };

    this.newStageRequests = ({ count }) => {
      this.add({
        id: 'new-stage-request',
        message: `You have ${count < 0 ? 'new stage' : `${count} pending`} request${
          count === 1 ? '' : 's'
        }`,
        duration: 3000,
      });
    };

    this.stageStatusUpdateListener = (status) => {
      if (status === 'ON_STAGE') this.addStagePeersListeners(meeting);
      else this.removeStagePeersListeners(meeting);
    };

    this.socketReconnectedListener = () => this.socketUpdateListener({ event: 'reconnected' });

    this.socketDisconnectedListener = () => this.socketUpdateListener({ event: 'disconnected' });

    this.socketReconnectingListener = () => this.socketUpdateListener({ event: 'reconnecting' });

    this.socketFailureListener = () => this.socketUpdateListener({ event: 'failed' });

    this.socketReconnectFailureListener = ({ attempt }) =>
      this.socketUpdateListener({
        event: 'reconnectFailure',
        attempt,
      });

    !showLivestream(meeting) && meeting.chat?.addListener('chatUpdate', this.chatUpdateListener);

    // temp fix for viewType mismatch with CHAT
    if (meeting.self.config.viewType?.toString() === 'CHAT') {
      return;
    }

    // all non Chat viewtype code from here
    const currentDevices = meeting.self.getCurrentDevices();
    if (currentDevices.speaker != null) {
      this.audio.setDevice(currentDevices.speaker.deviceId);
    }

    if (isLivestream) meeting.stage?.on('stageStatusUpdate', this.stageStatusUpdateListener);
    else this.addStagePeersListeners(meeting);
    if (this.canAcceptWaitingRequests()) {
      meeting.participants.waitlisted.addListener(
        'participantJoined',
        this.waitlistedParticipantJoinedListener
      );
    }

    meeting.polls?.addListener('pollsUpdate', this.pollUpdateListener);
    meeting.self.addListener('deviceUpdate', this.deviceUpdateListener);
    meeting.meta.addListener('socketReconnected', this.socketReconnectedListener);
    meeting.meta.addListener('socketDisconnected', this.socketDisconnectedListener);
    meeting.meta.addListener('socketReconnecting', this.socketReconnectingListener);
    meeting.meta.addListener('socketFailure', this.socketFailureListener);
    meeting.meta.addListener('socketReconnectFailure', this.socketReconnectFailureListener);
    meeting.remote?.addListener('remoteUpdate', this.onRemoteUpdate);
    meeting.meta?.addListener('activeTabUpdate', this.activeTabUpdateListener);
    meeting.recording?.addListener('recordingUpdate', this.onRecordingUpdate);
    meeting.stage?.addListener('stageRequestApproved', this.stageRequestAccepted);
    meeting.stage?.addListener('stageRequestRejected', this.stageRequestRejected);
    if (meeting.self.permissions.stageEnabled && meeting.self.permissions.acceptStageRequests) {
      meeting.stage?.addListener('newStageRequest', this.newStageRequests);
    }
  }

  private addStagePeersListeners = (meeting: Meeting) => {
    meeting.participants.joined.addListener('participantJoined', this.participantJoinedListener);
    meeting.meta.addListener('disconnected', this.networkDisconnectedListener);
    meeting.meta.addListener('connected', this.networkConnectedListener);
    meeting.participants.joined.addListener('participantLeft', this.participantLeftListener);
  };

  private removeStagePeersListeners = (meeting: Meeting) => {
    meeting.participants.joined.removeListener('participantJoined', this.participantJoinedListener);
    meeting.meta.removeListener('disconnected', this.networkDisconnectedListener);
    meeting.meta.removeListener('connected', this.networkConnectedListener);
    meeting.participants.joined.removeListener('participantLeft', this.participantLeftListener);
  };

  @Watch('config')
  configChanged(config: UIConfig) {
    if (config != null) {
      if (config?.config != null) {
        this.permissions = parseConfig(config.config);
        this.enabledSounds = getEnabledSounds(this.permissions.notification_sounds);
      }
    }
  }

  @Watch('states')
  statesChanged(states: States) {
    if (states != null) {
      const notificationSoundsEnabled = !states?.prefs?.muteNotificationSounds;

      // toggle only the notification sounds values which were enabled in the first place
      for (const permission of this.enabledSounds) {
        if (permission in this.permissions.notification_sounds) {
          this.permissions.notification_sounds[permission] = notificationSoundsEnabled;
        }
      }
    }
  }

  @Listen('dyteAPIError', { target: 'window' })
  apiErrorListener({ detail }) {
    const { trace, message } = detail;
    this.add({
      id: trace,
      message,
      duration: DEFAULT_NOTIFICATION_DURATION,
      icon: this.iconPack.warning,
    });
  }

  @Listen('dyteSendNotification', { target: 'window' })
  sendNotificationListener({ detail }) {
    const { trace, message } = detail;
    this.add({
      id: trace,
      message,
      duration: DEFAULT_NOTIFICATION_DURATION,
    });
  }

  private onRemoteUpdate = ({ payload, type }: { payload: RemoteUpdatePayload; type: any }) => {
    if (type === RemoteUpdateType.INCOMING_REQUEST_ACCEPTED) {
      let remotePeer = this.meeting.participants.joined.get(payload.request.remotePeerId);
      this.add({
        id: `message-${Math.random().toString(36)}`,
        icon: this.iconPack.chat,
        message: `${this.t('notifications.remote_control_granted')} ${remotePeer.name}`,
        duration: DEFAULT_NOTIFICATION_DURATION,
      });
    }
    if (type === RemoteUpdateType.OUTGOING_REQUEST_ACCEPTED) {
      let hostPeer = this.meeting.participants.joined.get(payload.request.hostPeerId);
      this.add({
        id: `message-${Math.random().toString(36)}`,
        icon: this.iconPack.chat,
        message: `${hostPeer.name} ${this.t('notifications.remote_control_request_accepted')}`,
        duration: DEFAULT_NOTIFICATION_DURATION,
      });
    }
    if (type === RemoteUpdateType.REQUEST_RECEIVED) {
      let remotePeer = this.meeting.participants.joined.get(payload.request.remotePeerId);
      this.add({
        id: `message-${Math.random().toString(36)}`,
        icon: this.iconPack.chat,
        message: `${remotePeer.name} ${this.t('notifications.remote_control_requested')}`,
        duration: DEFAULT_NOTIFICATION_DURATION,
      });
    }
    if (
      type === RemoteUpdateType.INCOMING_REQUEST_ENDED ||
      type === RemoteUpdateType.OUTGOING_REQUEST_ENDED
    ) {
      this.add({
        id: `message-${Math.random().toString(36)}`,
        icon: this.iconPack.chat,
        message: `${this.t('notifications.remote_control_terminated')}`,
        duration: DEFAULT_NOTIFICATION_DURATION,
      });
    }
    if (type === RemoteUpdateType.REQUEST_SENT) {
      let hostPeer = this.meeting.participants.joined.get(payload.request.hostPeerId);
      this.add({
        id: `message-${Math.random().toString(36)}`,
        icon: this.iconPack.chat,
        message: `${this.t('notifications.remote_control_request_sent')} ${hostPeer.name}`,
        duration: DEFAULT_NOTIFICATION_DURATION,
      });
    }
  };

  private onDyteNotification = (
    e: CustomEvent<Notification & { playSound: Sound | undefined }>
  ) => {
    this.add(e.detail);
    const playSound = e.detail.playSound;
    if (playSound != undefined) this.audio.play(playSound);
  };

  private onRecordingUpdate = (recordingState: RecordingState) => {
    if (
      recordingState === 'RECORDING' &&
      this.permissions.notifications.recording_started !== false
    ) {
      this.add({
        id: 'recording-started',
        icon: this.iconPack.recording,
        message: this.t('recording.started'),
        duration:
          this.permissions.notification_duration.recording_started ?? DEFAULT_NOTIFICATION_DURATION,
      });
    } else if (
      recordingState === 'STOPPING' &&
      this.permissions.notifications.recording_stopped !== false
    ) {
      this.add({
        id: 'recording-stopped',
        icon: this.iconPack.stop_recording,
        message: this.t('recording.stopped'),
        duration:
          this.permissions.notification_duration.recording_stopped ?? DEFAULT_NOTIFICATION_DURATION,
      });
    }
  };

  private add(notification: Notification) {
    // show notifications only if tab is in focus and a maximum of 5 at a time
    if (document.visibilityState === 'visible' && this.notifications.length < 5) {
      // adds new notification to start of array so they appear at the bottom
      this.notifications = [...this.notifications, notification];
    }
  }

  private remove(id: string) {
    this.notifications = this.notifications.filter((notification) => notification.id !== id);
  }

  private handleDismiss(e: CustomEvent<string>) {
    e.stopPropagation();

    const id = e.detail;
    const el = this.host.shadowRoot.querySelector(`[data-id="${id}"]`);
    // exit animation
    el?.classList.add('exit');

    setTimeout(() => {
      writeTask(() => {
        this.remove(id);
      });
    }, 400);
  }

  private canPlayParticipantJoinedSound(): boolean {
    return (
      this.permissions.participant_joined_sound_notification_limit == undefined ||
      this.permissions.participant_joined_sound_notification_limit <= 0 ||
      this.meeting.participants.count <=
        this.permissions.participant_joined_sound_notification_limit
    );
  }

  private canPlayChatSound(): boolean {
    return (
      this.permissions.participant_chat_message_sound_notification_limit == undefined ||
      this.permissions.participant_chat_message_sound_notification_limit <= 0 ||
      this.meeting.participants.count <=
        this.permissions.participant_chat_message_sound_notification_limit
    );
  }

  private canAcceptWaitingRequests(): boolean {
    return (
      this.permissions.notifications.participant_joined_waitlist &&
      this.meeting.self.permissions.acceptWaitingRequests
    );
  }

  render() {
    return (
      <Host>
        {this.notifications.map((notification) => (
          <dyte-notification
            size={this.size}
            key={notification.id}
            data-id={notification.id}
            notification={notification}
            onDyteNotificationDismiss={(e: CustomEvent<string>) => this.handleDismiss(e)}
            iconPack={this.iconPack}
            t={this.t}
          />
        ))}
      </Host>
    );
  }
}
