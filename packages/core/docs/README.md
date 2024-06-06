# Dyte UI Kit

Read on to understand the project and how you can get started, or open up the section:

- [UI Config](./config.md)

## Project Structure

Each component resides in a folder of their own, like: `src/components/my-component`.

You can create a new component by running:

```sh
npm run generate my-component
```

This will create 4 files:

```sh
├── my-component
│   ├── my-component.css
│   ├── my-component.tsx
│   └── test
│       ├── my-component.e2e.ts
│       └── my-component.spec.tsx
```

The test files are optional, which you can omit at first and add later.

## Styling components

We handle the design tokens with the help of tailwindcss.

The entire design system is defined in the [tailwindcss config](../tailwind.config.js).

> Note that you can use ordinary css along with tailwindcss' `@apply` directive and `theme()`.

> Tip: You can nest css selectors thanks to the `tailwindcss/nesting` plugin!

You can use these styles in css files like:

```css
:host {
  /** @apply directive */
  @apply flex items-center justify-center bg-brand-500;
  /** or you can use the theme values with theme() */
  border-left: theme('borderWidths.sm') solid theme('colors.brand.500');
}
```

### Responsiveness

The `size` prop for all components are reflected in the DOM, so you can set styles by using the css selector as:

```css
:host([size='sm']) {
  @apply inline;
}
```

### Styling for slotted components

You can use the [`::slotted()`](https://developer.mozilla.org/en-US/docs/Web/CSS/::slotted) pseudo-element to apply styles on any slotted components, i.e; elements which are added to an element via a slot.

For example, `<dyte-name-tag>` is added inside the slot of `<dyte-peer-view>`, so you can style `dyte-name-tag` inside `dyte-peer-view.css` as follows:

```css
:host(::slotted(dyte-name-tag)) {
  @apply absolute top-3 left-3;
}
```

## Hierarchy of components

### Top level component

This is just the one top level component: `dyte-meeting` which just takes a meeting object and loads your server rendered config and renders the entire UI based on it.

### Mid level component

These are components like `dyte-header`, `dyte-stage`, `dyte-controlbar` which are essential containers for the low-level components and have some state within, like for example:

`dyte-stage` can have a sidebar as well as plugins with the default grid. So there will be states in the component which will handle these states and render components accordingly.

### Low level component

These are all the lowest level components or units which help make a full meeting UI.

These are:

- dyte-mic-toggle
- dyte-camera-toggle
- dyte-logo
- ... and many more

These components will take in some default props via attributes:

```ts
interface DefaultProps {
  meeting: Meeting
  config?: UIConfig
  size?: Size
  states?: States
  iconPack?: IconPack
  t?: LangDict
}
```

Some important points:

- The meeting object is required for all components.
- The config object is optional, as only a few components will need it
  - like `<dyte-icon>` will need the config object to render the logo
- The `size` prop can be used for styling your component for different breakpoints and also for using in structuring your component
- The `iconPack` prop is optional, and if you don't pass it, it will use the `defaultIconPack` which is an icon set from [fluent-icons](https://fluenticons.co/outlined/)
- The `t` prop is optional, uses `defaultLanguage` by default which is `en`.
- The `states` prop is optional and is passed down from `<dyte-meeting>` component which has all the states which are needed for a meeting.

## Handling imports in StencilJS

Stencil requires all imports to be named, and gives an error otherwise when running.

So, commonly used types from `web-core` and others are named exports from the `types` directory.

- [`dyte-client.ts`](../src/types/dyte-client.ts) consists of types & exports which are required from the `web-core` package.
- [`props.ts`](../src/types/props.ts) consists of a set of types which are commonly used by components like `Size`, `States`.
- [`ui-config/*.ts`](../src/types/ui-config) consists of types for the UI Config.

## Icon Pack

By default, we provide the fluent icons.

You can specify an icon pack in the UI config, or pass it as a prop to `dyte-meeting` as:

```html
<dyte-meeting icon-pack-url="https://icons.dyte.io/material.json"></dyte-meeting>
```

These icons are fetched and merged with the default icon pack to handle missing icons and is passed down to individual components.

Note that only the `dyte-meeting` components accepts the URL, all other components accept the `iconPack` prop, which is just the object downloaded from the URL.

Dyte will provide a set of most commonly used icon packs via a CDN on `icons.dyte.io` or `assets.dyte.io/icons`

## Language

You can specify a language in the UI config, or pass it as a prop to `dyte-meeting` as:

The language codes are specified in [ISO 639-1 Code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes).

Note that only the `dyte-meeting` components accepts the `language` property, all other components accept the `t` prop, which is just the object containing the language data.

> We cannot use the `lang` attribute as it is a reserved attribute which stencil doesn't allow to be used a prop in our components.

```html
<dyte-meeting language="hi"></dyte-meeting>
```

The language dictionaries will be available via a CDN, and `dyte-meeting` will download the necessary dictionary based on the provided language code.

CDN: `https://assets.dyte.io/languages/{language}.json`
