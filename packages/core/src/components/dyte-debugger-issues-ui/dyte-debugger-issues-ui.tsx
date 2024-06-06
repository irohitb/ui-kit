import { Component, Host, Prop, h, State } from '@stencil/core';
import { States, Size, IconPack, defaultIconPack, DyteI18n } from '../../exports';
import { useLanguage } from '../../lib/lang';
import { Meeting } from '../../types/dyte-client';
import { issueList } from '../../utils/troubleshooter';

@Component({
  tag: 'dyte-debugger-issues-ui',
  styleUrl: 'dyte-debugger-issues-ui.css',
  shadow: true,
})
export class DyteDebuggerAudio {
  private reportEl: HTMLParagraphElement;

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

  /** Media Type */
  @Prop() mediaType: 'audio' | 'video' | 'screenshare';

  @State() issueIndex: number = 0;

  @State() reported: boolean = true;

  private selectIssue(val: string) {
    this.issueIndex = parseInt(val);
    this.reported = false;
    setTimeout(() => {
      this.reportEl?.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    }, 100);
  }

  // TODO: (ishita1805) Send surrounding data for issues in phase 3.
  private reportIssue() {
    const { value } = issueList[this.mediaType][this.issueIndex];
    this.meeting.__internals__.logger.info('dyteTroubleshooting::issue', {
      issue: value,
    } as any);
    this.reported = true;
    setTimeout(() => {
      this.reported = false;
    }, 3000);
  }

  render() {
    const issues = issueList[this.mediaType] ?? [];

    return (
      <Host>
        <div class="text">{this.t('Please select a prompt that best describes your issue')}</div>
        <select
          class={`dyte-select ${this.issueIndex === 0 ? 'disabled' : ''}`}
          onChange={(e) => this.selectIssue((e.target as HTMLSelectElement).value)}
        >
          {issues.map((issue) => (
            <option value={issue.index}>
              <span>{issue.value}</span>
            </option>
          ))}
        </select>
        {issues[this.issueIndex]?.steps?.length > 0 && (
          <div class="sub-title">{this.t('How to fix this:')}</div>
        )}
        {issues[this.issueIndex]?.steps?.map((step: string) => (
          <div class="recommendation">
            <div>&#8226;</div>
            {this.t(step)}
          </div>
        ))}
        {issues[this.issueIndex]?.steps?.length > 0 &&
          (this.reported ? (
            <p class="report-link">{this.t('Your issue has been reported.')}</p>
          ) : (
            <div class="report-issue">
              <p class="recommendation" ref={(el) => (this.reportEl = el)}>
                {this.t('Still facing the issue?')}
              </p>
              <dyte-button size="sm" variant="secondary" onClick={() => this.reportIssue()}>
                {this.t('Report Now')}
              </dyte-button>
            </div>
          ))}
      </Host>
    );
  }
}
