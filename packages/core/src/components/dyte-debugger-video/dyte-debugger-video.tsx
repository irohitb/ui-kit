import { Component, Host, Prop, h, State, Watch, Event, EventEmitter } from '@stencil/core';
import { States, Size, IconPack, defaultIconPack, DyteI18n } from '../../exports';
import { useLanguage } from '../../lib/lang';
import { MediaPermission, Meeting } from '../../types/dyte-client';
import storeState from '../../lib/store';

interface VideoTrackStats {
  isBlackFrame: boolean;
  isFrozenFrame: boolean;
  timestamp: number;
  videoScore: number;
}

type CameraMetadata = {
  label?: string;
  resolution?: number[];
};

@Component({
  tag: 'dyte-debugger-video',
  styleUrl: 'dyte-debugger-video.css',
  shadow: true,
})
export class DyteDebuggerAudio {
  private videoEl: HTMLVideoElement;
  private blackFramesCount: number = 0;

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

  /** Test Progress Event */
  @Event() testProgress: EventEmitter<number>;

  @State() activeTab: 'Troubleshoot' | 'Report' | 'none' = 'Report';

  @State() stage: number = 0;

  @State() mediaPermission: MediaPermission = 'NOT_REQUESTED';

  @State() videoPreview: boolean = false;

  @State() videoMetadata: CameraMetadata = {};

  @State() videoTrackStats: VideoTrackStats = {
    isBlackFrame: false,
    isFrozenFrame: false,
    timestamp: 0,
    videoScore: 0,
  };

  connectedCallback() {
    this.meetingChanged(this.meeting);
    this.updateProgress();
  }

  disconnectedCallback() {
    const { self, troubleshoot } = this.meeting;
    this.videoPreview && this.toggleVideoTest();
    self?.removeListener('mediaPermissionUpdate', this.mediaPermissionUpdateListener);
    troubleshoot?.video?.removeListener('videoTrackStats', this.videoTrackUpdateListener);
  }

  @Watch('meeting')
  async meetingChanged(meeting) {
    if (!meeting) return;
    const { self, troubleshoot } = meeting;
    if (self?.videoTrack) {
      await this.getTrackInfo();
    }
    self?.on('deviceUpdate', this.deviceUpdateListner.bind(this));
    self.addListener('mediaPermissionUpdate', this.mediaPermissionUpdateListener.bind(this));
    const permission = self?.mediaPermissions?.video;
    this.mediaPermissionUpdateListener({ kind: 'video', message: permission });
    troubleshoot?.video?.on('videoTrackStats', this.videoTrackUpdateListener.bind(this));
  }

  private mediaPermissionUpdateListener({ kind, message }) {
    if (kind !== 'video') return;
    this.mediaPermission = message;
    if (this.mediaPermission !== 'ACCEPTED') {
      this.stage = 0;
      this.updateProgress();
      if (this.videoPreview) this.toggleVideoTest();
    }
  }

  private deviceUpdateListner({ device, preview }) {
    if (preview) return;
    if (device?.kind !== 'videoinput') return;
    this.getTrackInfo();
  }

  private videoTrackUpdateListener(data: any) {
    this.videoTrackStats = { ...data, videoScore: this.normalizeVideoScore(data?.videoScore) };
  }

  private setActiveTab(state: 'Troubleshoot' | 'Report' | 'none') {
    this.activeTab = state;
    this.updateProgress();
  }

  private async toggleVideoTest() {
    this.videoPreview = !this.videoPreview;
    const troubleshooter = this.meeting?.troubleshoot?.video;
    if (this.videoPreview) {
      const track = await troubleshooter?.startPreview();
      const stream = new MediaStream();
      if (!track) return;
      stream.addTrack(track);
      setTimeout(() => {
        this.videoEl.srcObject = stream;
      }, 500);
      this.getTrackInfo();
      await troubleshooter?.startTrackAnalysis();
    } else {
      troubleshooter?.stopPreview();
      troubleshooter?.stopTrackAnalysis();
      this.videoEl.srcObject = undefined;
    }
  }

  private getTrackInfo() {
    this.videoMetadata = this.meeting.troubleshoot?.video?.getTrackMetadata();
  }

  private getAnalysisStatus() {
    let message = 'All systems are functional.';
    let icon = 'checkmark';
    let style = 'success';
    if (this.videoTrackStats?.isBlackFrame) {
      this.blackFramesCount++;
    } else {
      this.blackFramesCount = 0;
    }

    if (this.videoTrackStats?.isFrozenFrame) {
      message = 'Looks like the video is frozen.';
      icon = 'warning';
      style = 'error';
    }

    if (this.blackFramesCount > 10) {
      message = 'Video is not being processed by the camera.';
      icon = 'warning';
      style = 'error';
    }

    return (
      <div class={`row status-text ${style}`}>
        <dyte-icon size="sm" icon={this.iconPack[icon]}></dyte-icon>
        {this.t(message)}
      </div>
    );
  }

  private changeStage(stage: number) {
    if (this.mediaPermission !== 'ACCEPTED') return;
    stage = Math.max(0, stage);
    stage = Math.min(1, stage);
    this.stage = stage;
    this.updateProgress();
    if (this.videoPreview) this.toggleVideoTest();
  }

  private updateProgress() {
    if (this.activeTab === 'Troubleshoot') {
      this.testProgress.emit(((this.stage + 1) * 100) / 2);
    } else this.testProgress.emit(0);
  }

  private formatLabel(camelCaseLabel: string) {
    const result = camelCaseLabel.replace(/([A-Z])/g, ' $1');
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  private boolToStr(val: boolean) {
    if (val) return 'Yes';
    return 'No';
  }

  private normalizeVideoScore(val = 0) {
    let max = 1;
    const min = 0;
    if (val > max) max = val;
    return Math.max(5, Math.round((val * 10) / (max - min)));
  }

  render() {
    const defaults = {
      meeting: this.meeting,
      states: this.states || storeState,
      iconPack: this.iconPack,
      t: this.t,
      size: this.size,
    };

    return (
      <Host>
        <div id="header">
          {['Report', 'Troubleshoot'].map((section: any) => (
            <dyte-button
              key={section}
              variant="ghost"
              class={{ active: this.activeTab === section }}
              onClick={() => this.setActiveTab(section)}
              iconPack={this.iconPack}
              t={this.t}
            >
              {this.t(section)}
            </dyte-button>
          ))}
        </div>
        {this.activeTab === 'Troubleshoot' && (
          <div class="tab-body">
            <div>
              <div class="stage-indicator">Step {this.stage + 1}/2</div>
              {/* Stage 0: Permissions */}
              {this.stage === 0 && (
                <dyte-debugger-permissions-ui
                  {...defaults}
                  mediaType="video"
                ></dyte-debugger-permissions-ui>
              )}
              {/* Stage 1: Camera Tests */}
              {this.stage === 1 && (
                <div>
                  <div class="title">Camera Test</div>
                  <div class="text">
                    {this.t(
                      'Upon starting the Camera Test, a video preview will be enabled for you.'
                    )}
                  </div>
                  <dyte-button size="md" onClick={() => this.toggleVideoTest()}>
                    {this.videoPreview ? 'Stop' : 'Start'} Camera Test
                  </dyte-button>
                  {this.videoPreview && this.videoMetadata && (
                    <div class="col">
                      {/* Device Information */}
                      <div class="sub-title">
                        Device Information
                        <dyte-information-tooltip iconPack={this.iconPack}>
                          <div slot="tootlip-text" class="tooltip-text">
                            {Object.keys(this.videoMetadata).map((key) => (
                              <div>
                                {this.formatLabel(key)}:
                                <span>{JSON.stringify(this.videoMetadata[key])}</span>
                              </div>
                            ))}
                          </div>
                        </dyte-information-tooltip>
                      </div>
                      <div class="row">
                        <div class="label">
                          <span>{this.t('Device Label')}</span>:
                        </div>
                        <div class="text">{this.t(this.videoMetadata.label)}</div>
                      </div>

                      {/* Device Analysis */}
                      <div class="sub-title">
                        Video & Device Analysis
                        <dyte-information-tooltip iconPack={this.iconPack}>
                          <div slot="tootlip-text" class="tooltip-text">
                            <div>
                              Video Score:<span>{this.videoTrackStats.videoScore}/10</span>
                            </div>
                            <div>
                              Black Frame Detected:
                              <span>{this.boolToStr(this.videoTrackStats.isBlackFrame)}</span>
                            </div>
                            <div>
                              Frozen Frame Detected:
                              <span>{this.boolToStr(this.videoTrackStats.isFrozenFrame)}</span>
                            </div>
                            <div>
                              Time:
                              <span>
                                {new Date(this.videoTrackStats.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        </dyte-information-tooltip>
                      </div>
                      <div class="video-container">
                        {!this.videoPreview && (
                          <div class="no-video-preview">
                            <dyte-icon icon={this.iconPack.video_off} size="md" />
                          </div>
                        )}
                        <video
                          ref={(el) => (this.videoEl = el)}
                          autoPlay
                          playsInline
                          muted
                          class="video-preview"
                        />
                      </div>
                      {this.getAnalysisStatus()}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Prev and Next buttons */}
            <div class="stage-manager">
              {this.stage > 0 && (
                <div
                  class={{ 'stage-button': true, disabled: this.mediaPermission !== 'ACCEPTED' }}
                  onClick={() => this.changeStage(this.stage - 1)}
                >
                  <dyte-icon size="sm" icon={this.iconPack.chevron_left} />
                  Prev
                </div>
              )}
              {this.stage < 1 && (
                <div
                  class={{ 'stage-button': true, disabled: this.mediaPermission !== 'ACCEPTED' }}
                  onClick={() => this.changeStage(this.stage + 1)}
                >
                  Next
                  <dyte-icon size="sm" icon={this.iconPack.chevron_right} />
                </div>
              )}
            </div>
          </div>
        )}

        {this.activeTab === 'Report' && (
          <div class="tab-body">
            <dyte-debugger-issues-ui {...defaults} mediaType="video"></dyte-debugger-issues-ui>
          </div>
        )}
      </Host>
    );
  }
}
