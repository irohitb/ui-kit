import { Component, Host, h, Prop, State, Watch } from '@stencil/core';
import { defaultIconPack, IconPack } from '../../lib/icons';
import { DyteI18n, useLanguage } from '../../lib/lang';
import { Meeting } from '../../types/dyte-client';
import { Size } from '../../types/props';
import { ControlBarVariant } from '../dyte-controlbar-button/dyte-controlbar-button';

@Component({
  tag: 'dyte-webinar-stage-toggle',
  styleUrl: 'dyte-webinar-stage-toggle.css',
  shadow: true,
})
export class DyteWebinarStageToggle {
  private requestToJoinAcceptedListener = () => {
    this.stageStatus = 'ACCEPTED';
  };

  private requestToJoinRejectedListener = () => {
    this.stageStatus = 'DENIED';
  };

  private stageJoinedListener = () => {
    this.stageStatus = 'ACCEPTED';
  };

  private removeFromStageListener = () => {
    this.stageStatus = 'NOT_REQUESTED';
  };

  private selfStageLeftListener = () => {
    this.stageStatus = 'NOT_REQUESTED';
  };

  private requestStageListener = () => {
    this.stageStatus = 'PENDING';
  };

  /** Variant */
  @Prop({ reflect: true }) variant: ControlBarVariant = 'button';

  /** Meeting object */
  @Prop() meeting: Meeting;

  /** Size */
  @Prop({ reflect: true }) size: Size;

  /** Icon pack */
  @Prop() iconPack: IconPack = defaultIconPack;

  /** Language */
  @Prop() t: DyteI18n = useLanguage();

  @State() stageStatus: 'NOT_REQUESTED' | 'PENDING' | 'ACCEPTED' | 'DENIED' = 'NOT_REQUESTED';

  @State() canPresent: boolean = false;
  @State() requestProduce: boolean = false;

  connectedCallback() {
    this.meetingChanged(this.meeting);
    this.meeting.self.addListener('joinStageRequestAccepted', this.requestToJoinAcceptedListener);
    this.meeting.self.addListener('joinStageRequestRejected', this.requestToJoinRejectedListener);
    this.meeting.self.addListener('stageJoined', this.stageJoinedListener);
    this.meeting.self.addListener('removedFromStage', this.removeFromStageListener);
    this.meeting.self.addListener('stageLeft', this.selfStageLeftListener);
    this.meeting.self.addListener('peerRequestToJoinStage', this.requestStageListener);
    this.meeting.self.permissions.addListener('permissionsUpdate', this.permissionsUpdateListener);
  }

  disconnectedCallback() {
    this.meeting.self.removeListener(
      'joinStageRequestAccepted',
      this.requestToJoinAcceptedListener
    );
    this.meeting.self.removeListener(
      'joinStageRequestRejected',
      this.requestToJoinRejectedListener
    );
    this.meeting.self.removeListener('removedFromStage', this.removeFromStageListener);
    this.meeting.self.removeListener('stageJoined', this.stageJoinedListener);
    this.meeting.self.removeListener('stageLeft', this.selfStageLeftListener);
    this.meeting.self.removeListener('peerRequestToJoinStage', this.requestStageListener);
    this.meeting?.self.permissions.removeListener(
      'permissionsUpdate',
      this.permissionsUpdateListener
    );
  }

  @Watch('meeting')
  meetingChanged(meeting: Meeting) {
    if (meeting != null) {
      this.requestProduce = meeting.self.permissions.requestProduce;
      this.canPresent = meeting.self.permissions.canPresent;

      if (this.canPresent || meeting.self.webinarStageStatus === 'ON_STAGE') {
        this.stageStatus = 'ACCEPTED';
      }
    }
  }

  private permissionsUpdateListener = () => {
    this.requestProduce = this.meeting.self.permissions.requestProduce;
    this.canPresent = this.meeting.self.permissions.canPresent;
  };

  private stageCallback = async () => {
    const self = this.meeting?.self;
    if (self == null || (!this.requestProduce && !this.canPresent)) {
      return;
    }

    if (this.stageStatus === 'PENDING') {
      await self.withdrawRequestToJoinStage();
      return;
    }

    if (this.stageStatus === 'ACCEPTED') {
      await self.leaveStage();
      this.stageStatus = 'NOT_REQUESTED';
      return;
    }

    if (this.canPresent) {
      await self.joinStage();
      this.stageStatus = 'ACCEPTED';
    } else {
      await self.requestToJoinStage();
      this.stageStatus = 'PENDING';
    }
  };

  private getState() {
    let tooltipLabel = '';
    let label = '';
    let icon = '';
    let classList = {};
    let disabled = false;

    if (this.stageStatus === 'PENDING') {
      label = this.t('stage_request.cancel_request');
      tooltipLabel = this.t('stage_request.pending_tip');
      icon = this.iconPack.leave_stage;
      classList['red-icon'] = false;
    } else if (this.stageStatus === 'ACCEPTED') {
      label = this.t('stage_request.leave_stage');
      tooltipLabel = this.t('stage_request.leave_tip');
      icon = this.iconPack.leave_stage;
      classList['red-icon'] = false;
      disabled = false;
    } else if (this.stageStatus === 'DENIED') {
      label = this.t('stage_request.denied');
      tooltipLabel = this.t('stage_request.denied_tip');
      icon = this.iconPack.join_stage;
      classList['red-icon'] = false;
      disabled = true;
    } else {
      label = this.t('stage_request.request');
      if (this.canPresent) {
        tooltipLabel = this.t('stage_request.request');
      } else {
        tooltipLabel = this.t('stage_request.request_tip');
      }
      icon = this.iconPack.join_stage;
      disabled = false;
    }

    return { tooltipLabel, label, icon, classList, disabled };
  }

  render() {
    if (!this.requestProduce && !this.canPresent) {
      return null;
    }
    if (this.meeting.self.config.viewType !== 'WEBINAR') {
      return null;
    }

    const { tooltipLabel, label, icon, classList, disabled } = this.getState();

    return (
      <Host title={label}>
        <dyte-tooltip
          placement="top"
          kind="block"
          label={tooltipLabel}
          delay={600}
          part="tooltip"
          iconPack={this.iconPack}
          t={this.t}
        >
          <dyte-controlbar-button
            part="controlbar-button"
            size={this.size}
            iconPack={this.iconPack}
            t={this.t}
            variant={this.variant}
            label={label}
            icon={icon}
            class={classList}
            onClick={this.stageCallback}
            disabled={disabled}
            showWarning={false}
          />
        </dyte-tooltip>
      </Host>
    );
  }
}
