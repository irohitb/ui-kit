import { Component, Host, h, Prop, State, Watch, Event, EventEmitter } from '@stencil/core';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import storeState, { onChange } from '../../lib/store';
import { Meeting, Peer, WaitlistedParticipant } from '../../types/dyte-client';
import { Size, States } from '../../types/props';
import { canViewParticipants } from '../../utils/sidebar';
import { ControlBarVariant } from '../dyte-controlbar-button/dyte-controlbar-button';

/**
 * A button which toggles visibility of participants.
 *
 * When clicked it emits a `dyteStateUpdate` event with the data:
 *
 * ```ts
 * { activeSidebar: boolean; sidebar: 'participants' }
 * ```
 */
@Component({
  tag: 'dyte-participants-toggle',
  styleUrl: 'dyte-participants-toggle.css',
  shadow: true,
})
export class DyteParticipantsToggle {
  private waitlistedParticipantJoinedListener: (participant: WaitlistedParticipant) => void;
  private waitlistedParticipantLeftListener: (participant: WaitlistedParticipant) => void;
  private removeStateChangeListener: () => void;

  /** Variant */
  @Prop({ reflect: true }) variant: ControlBarVariant = 'button';

  /** Meeting object */
  @Prop() meeting: Meeting;

  /** States object */
  @Prop() states: States;

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  @State() participantsActive: boolean = false;

  @State() waitlistedParticipants: WaitlistedParticipant[] = [];
  @State() stageRequestedParticipants: Peer[] = [];
  @State() badgeCount: number = 0;

  @State() canViewParticipants: boolean = false;

  connectedCallback() {
    this.meetingChanged(this.meeting);
    this.statesChanged(this.states);
    this.removeStateChangeListener = onChange('sidebar', () => this.statesChanged());
  }

  disconnectedCallback() {
    this.removeStateChangeListener && this.removeStateChangeListener();
    if (this.meeting == null) return;
    this.meeting?.stage?.removeListener('stageStatusUpdate', this.updateCanView);
    this.waitlistedParticipantJoinedListener &&
      this.meeting.participants.waitlisted.removeListener(
        'participantJoined',
        this.waitlistedParticipantJoinedListener
      );
    this.waitlistedParticipantLeftListener &&
      this.meeting.participants.waitlisted.removeListener(
        'participantLeft',
        this.waitlistedParticipantLeftListener
      );
    this.meeting.stage?.removeListener('stageAccessRequestUpdate', this.updateStageRequests);
  }

  private updateStageRequests = async (stageRequests?: any[]) => {
    if (this.meeting.meta.viewType === 'LIVESTREAM') {
      if (!stageRequests) {
        stageRequests = (await this.meeting.stage?.getAccessRequests())?.stageRequests ?? [];
      }
      this.stageRequestedParticipants = stageRequests;
    } else {
      const participants = this.meeting.participants.joined
        .toArray()
        .filter((p) => p.stageStatus === 'REQUESTED_TO_JOIN_STAGE');

      this.stageRequestedParticipants =
        this.meeting.stage.status === 'REQUESTED_TO_JOIN_STAGE' ? [this.meeting.self] : [];

      this.stageRequestedParticipants = [...this.stageRequestedParticipants, ...participants];
    }
    this.updateBadgeCount();
  };

  private updateBadgeCount = () => {
    this.badgeCount = this.waitlistedParticipants.length + this.stageRequestedParticipants.length;
  };

  @Watch('meeting')
  meetingChanged(meeting: Meeting) {
    if (meeting == null) return;
    this.canViewParticipants = canViewParticipants(meeting);
    meeting?.stage?.on('stageStatusUpdate', this.updateCanView);
    if (meeting.self.permissions.acceptWaitingRequests) {
      this.waitlistedParticipants = meeting.participants.waitlisted.toArray();
      this.waitlistedParticipantJoinedListener = (participant: WaitlistedParticipant) => {
        if (!this.waitlistedParticipants.some((p) => p.id === participant.id)) {
          this.waitlistedParticipants = [...this.waitlistedParticipants, participant];
          this.updateBadgeCount();
        }
      };
      this.waitlistedParticipantLeftListener = (participant: WaitlistedParticipant) => {
        this.waitlistedParticipants = this.waitlistedParticipants.filter(
          (p) => p.id !== participant.id
        );
        this.updateBadgeCount();
      };
      meeting.participants.waitlisted.addListener(
        'participantJoined',
        this.waitlistedParticipantJoinedListener
      );
      meeting.participants.waitlisted.addListener(
        'participantLeft',
        this.waitlistedParticipantLeftListener
      );
    }

    if (
      this.meeting.self.permissions.stageEnabled &&
      this.meeting.self.permissions.acceptStageRequests
    ) {
      this.updateStageRequests();
      meeting?.stage.on('stageAccessRequestUpdate', this.updateStageRequests);
    }
    this.updateBadgeCount();
  }

  @Watch('states')
  statesChanged(s?: States) {
    const states = s || storeState;
    if (states != null) {
      this.participantsActive = states.activeSidebar === true && states.sidebar === 'participants';
    }
  }

  /** Emits updated state data */
  @Event({ eventName: 'dyteStateUpdate' }) stateUpdate: EventEmitter<States>;

  private toggleParticipantsTab() {
    const states = this.states || storeState;
    this.participantsActive = !(states?.activeSidebar && states?.sidebar === 'participants');
    storeState.activeSidebar = this.participantsActive;
    storeState.sidebar = this.participantsActive ? 'participants' : undefined;
    storeState.activeMoreMenu = false;
    storeState.activeAI = false;
    this.stateUpdate.emit({
      activeSidebar: this.participantsActive,
      sidebar: this.participantsActive ? 'participants' : undefined,
      activeMoreMenu: false,
      activeAI: false,
    });
  }

  private updateCanView = () => {
    this.canViewParticipants = canViewParticipants(this.meeting);
  };

  render() {
    if (!this.canViewParticipants) return;
    const text = this.t('participants');
    // const badgeCount = this.waitlistedParticipants.length + this.stageRequestedParticipants.length;
    return (
      <Host title={text}>
        {this.badgeCount !== 0 && !this.participantsActive && (
          <div class="waiting-participants-count" part="waiting-participants-count">
            <span>{this.badgeCount <= 100 ? this.badgeCount : '99+'}</span>
          </div>
        )}
        <dyte-controlbar-button
          part="controlbar-button"
          size={this.size}
          iconPack={this.iconPack}
          t={this.t}
          class={{ active: this.participantsActive }}
          onClick={() => this.toggleParticipantsTab()}
          icon={this.iconPack.participants}
          label={text}
          variant={this.variant}
        />
      </Host>
    );
  }
}
