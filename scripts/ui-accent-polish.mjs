const style=String.raw`
<style id="ycUiAccentPolishStyle">
/* Accent-only polish. Keep all existing geometry and interaction unchanged. */
.yc-v3-voice-host .voice-controls{
  border-color:color-mix(in srgb,var(--yc-theme,#70e4e8) 76%,#294b5d)!important;
  box-shadow:
    0 -8px 28px rgba(0,0,0,.14),
    0 0 18px color-mix(in srgb,var(--yc-theme,#70e4e8) 22%,transparent)!important;
}
.yc-v3-voice-host .voice-card-top{
  border-right:0!important;
  border-inline-end:0!important;
}
*{
  scrollbar-color:color-mix(in srgb,var(--yc-theme,#70e4e8) 54%,#304f65) #101820;
}
*::-webkit-scrollbar-thumb{
  background:linear-gradient(
    180deg,
    color-mix(in srgb,var(--yc-theme,#70e4e8) 62%,#456d86),
    color-mix(in srgb,var(--yc-theme,#70e4e8) 44%,#304f65)
  )!important;
}
*::-webkit-scrollbar-thumb:hover{
  background:linear-gradient(
    180deg,
    color-mix(in srgb,var(--yc-theme,#70e4e8) 78%,#5b8caa),
    color-mix(in srgb,var(--yc-theme,#70e4e8) 60%,#3d6781)
  )!important;
}
</style>
`;

export function withUiAccentPolish(html){
  const marker='// Register every feature before restoring a cached session.';
  for(const part of [marker,'.yc-v3-voice-host .voice-controls','.yc-v3-voice-host .voice-card-top','::-webkit-scrollbar-thumb']){
    if(!html.includes(part))throw Error('UI accent polish insertion boundary missing: '+part);
  }
  if(html.includes('ycUiAccentPolishStyle'))return html;
  return html.replace('</head>',style+'\n</head>');
}
