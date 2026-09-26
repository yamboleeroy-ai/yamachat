const style=String.raw`
<style id="ycVoiceThemePolishStyle">
:root{--yc-themed-scroll-track:#050f17}

/* One final scrollbar skin: the user's Yamachat theme wins over older cyan/blue skins. */
html,body,*{
  scrollbar-color:color-mix(in srgb,var(--yc-theme,#e056fd) 48%,#28485b) var(--yc-themed-scroll-track)!important;
}
*::-webkit-scrollbar-track{
  background:var(--yc-themed-scroll-track)!important;
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 10%,#132633)!important;
}
*::-webkit-scrollbar-thumb{
  background:linear-gradient(
    180deg,
    color-mix(in srgb,var(--yc-theme,#e056fd) 56%,#31546a),
    color-mix(in srgb,var(--yc-theme,#e056fd) 34%,#173447)
  )!important;
  border:2px solid var(--yc-themed-scroll-track)!important;
  border-radius:999px!important;
}
*::-webkit-scrollbar-thumb:hover{
  background:linear-gradient(
    180deg,
    color-mix(in srgb,var(--yc-theme,#e056fd) 72%,#4c7185),
    color-mix(in srgb,var(--yc-theme,#e056fd) 48%,#23475d)
  )!important;
}
.yc-v3-voice-host #soundboardPanel .soundboard-grid::-webkit-scrollbar-thumb{
  background:color-mix(in srgb,var(--yc-theme,#e056fd) 48%,#45687b)!important;
}

/* Theme contour for the main Yamachat bars/panels. Outline does not change geometry. */
html body #ycGlobalNav,
html body .yc-v3-ribbon,
html body .yc-v3-content-grid>.side,
html body .yc-v3-content-grid>.chat,
html body .yc-v3-content-grid>.right,
html body .yc-v3-workspace>.top{
  outline:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 34%,#27485b)!important;
  outline-offset:-1px!important;
}
html body .chat-head,
html body .composer-wrap{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 48%,#34596b)!important;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--yc-theme,#e056fd) 8%,transparent)!important;
}
html body .composer-wrap:focus-within{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 72%,#4c7183)!important;
  box-shadow:0 0 14px var(--yc-theme-soft,rgba(224,86,253,.12)),inset 0 0 0 1px color-mix(in srgb,var(--yc-theme,#e056fd) 16%,transparent)!important;
}

/* Voice dock outline follows the personal Yamachat theme, never the server color. */
html body #voiceControls,
html body .yc-v3-voice-host #voiceControls.voice-controls,
html body #voiceControls.yc-desktop-server-voice-accent{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 66%,#365769)!important;
  box-shadow:
    0 -8px 28px rgba(0,0,0,.16),
    inset 0 0 0 1px color-mix(in srgb,var(--yc-theme,#e056fd) 12%,transparent),
    0 0 18px var(--yc-theme-glow,rgba(224,86,253,.16))!important;
}

/* Remove the old connection dividers that form the thin L-shaped artefact. */
#voiceControls #voiceConnectionPanel,
.yc-v3-voice-host #voiceConnectionPanel{
  border-bottom:0!important;
}
#voiceControls .voice-card-top,
.yc-v3-voice-host .voice-card-top{
  border-right:0!important;
}
</style>
`;

export function withVoiceThemePolish(html){
  for(const marker of ['id="voiceControls"','id="voiceConnectionPanel"','--yc-theme'])
    if(!html.includes(marker))throw Error('Voice theme polish insertion boundary missing: '+marker);
  if(html.includes('ycVoiceThemePolishStyle'))return html;
  return html.replace('</head>',style+'\n</head>');
}
