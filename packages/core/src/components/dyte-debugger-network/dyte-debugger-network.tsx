import { Component, Host, Prop, h, State } from '@stencil/core';
import { States, Size, IconPack, defaultIconPack, DyteI18n } from '../../exports';
import { useLanguage } from '../../lib/lang';
import { Meeting } from '../../types/dyte-client';

@Component({
  tag: 'dyte-debugger-network',
  styleUrl: 'dyte-debugger-network.css',
  shadow: true,
})
export class DyteDebuggerNetwork {
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

  @State() issueKey: number = 0;

  render() {
    return <Host></Host>;
  }
}
