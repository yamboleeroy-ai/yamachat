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
html body .chat-head{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 48%,#34596b)!important;
}
html body .composer{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 62%,#34596b)!important;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb,var(--yc-theme,#e056fd) 10%,transparent),
    0 0 12px color-mix(in srgb,var(--yc-theme,#e056fd) 8%,transparent)!important;
}
html body .composer:focus-within,
html body.yc-wotlk-theme .composer:focus-within{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 88%,#6b95a8)!important;
  box-shadow:
    0 0 0 2px color-mix(in srgb,var(--yc-theme,#e056fd) 18%,transparent),
    0 0 18px color-mix(in srgb,var(--yc-theme,#e056fd) 28%,transparent),
    inset 0 0 0 1px color-mix(in srgb,var(--yc-theme,#e056fd) 24%,transparent)!important;
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

/* Server settings now use the same personal Yamachat theme language as the rest of the desktop UI. */
html body .yc-ss-back{
  background:rgba(2,7,12,.78)!important;
  backdrop-filter:blur(10px)!important;
}
html body .yc-ss-shell{
  background:
    radial-gradient(circle at 12% -8%,color-mix(in srgb,var(--yc-theme,#e056fd) 15%,transparent),transparent 38%),
    linear-gradient(145deg,#0b1721,#071019 74%)!important;
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 46%,#365769)!important;
  box-shadow:0 28px 80px rgba(0,0,0,.62),0 0 26px var(--yc-theme-glow,rgba(224,86,253,.12)),inset 0 1px 0 rgba(255,255,255,.035)!important;
}
html body .yc-ss-nav{
  background:linear-gradient(180deg,#0a1822,#07111a)!important;
  border-right-color:color-mix(in srgb,var(--yc-theme,#e056fd) 23%,#254050)!important;
}
html body .yc-ss-server{
  border-bottom-color:color-mix(in srgb,var(--yc-theme,#e056fd) 18%,#27404d)!important;
}
html body .yc-ss-server small,
html body .yc-ss-section,
html body .yc-ss-head small,
html body .yc-ss-card p,
html body .yc-ss-field label{
  color:#8fa8b5!important;
}
html body .yc-ss-server strong,
html body .yc-ss-head strong,
html body .yc-ss-card h3{
  color:#edf8fc!important;
}
html body .yc-ss-tab{
  color:#9db5c1!important;
  border:1px solid transparent!important;
}
html body .yc-ss-tab:hover{
  background:color-mix(in srgb,var(--yc-theme,#e056fd) 8%,#102532)!important;
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 20%,#29495b)!important;
  color:#fff!important;
}
html body .yc-ss-tab.active{
  background:linear-gradient(100deg,color-mix(in srgb,var(--yc-theme,#e056fd) 20%,#173244),#112532)!important;
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 48%,#365c70)!important;
  color:#fff!important;
  box-shadow:inset 3px 0 0 var(--yc-theme,#e056fd),0 0 14px var(--yc-theme-soft,rgba(224,86,253,.10))!important;
}
html body .yc-ss-main{
  background:linear-gradient(180deg,rgba(8,21,30,.96),rgba(6,15,23,.98))!important;
}
html body .yc-ss-head{
  background:linear-gradient(180deg,rgba(11,28,39,.98),rgba(7,18,27,.96))!important;
  border-bottom-color:color-mix(in srgb,var(--yc-theme,#e056fd) 24%,#294555)!important;
}
html body .yc-ss-close{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 34%,#36566a)!important;
  background:#0d202b!important;
  color:#b9cdd6!important;
  border-radius:10px!important;
}
html body .yc-ss-close:hover{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 70%,#52758a)!important;
  color:#fff!important;
}
html body .yc-ss-card,
html body .yc-role-list,
html body .yc-role-editor{
  background:linear-gradient(180deg,#0d1d28,#09151e)!important;
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 20%,#294759)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;
}
html body .yc-ss-field input,
html body .yc-ss-field textarea,
html body .yc-ss-field select,
html body .yc-invite-box input{
  background:#07151f!important;
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 22%,#29495a)!important;
  color:#e8f7fb!important;
}
html body .yc-ss-field input:focus,
html body .yc-ss-field textarea:focus,
html body .yc-ss-field select:focus{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 72%,#4f7b8c)!important;
  box-shadow:0 0 0 3px var(--yc-theme-soft,rgba(224,86,253,.10))!important;
}
html body .yc-ss-toggle,
html body .yc-perm,
html body .yc-role-assign-menu{
  background:#0a1923!important;
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 20%,#294653)!important;
}
html body .yc-ss-toggle input,
html body .yc-perm input,
html body .yc-role-assign-menu input{
  accent-color:var(--yc-theme,#e056fd)!important;
}
html body .yc-ss-btn{
  background:#102635!important;
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 26%,#36596b)!important;
  color:#dff7fb!important;
}
html body .yc-ss-btn:hover{
  border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 68%,#52798b)!important;
}
html body .yc-ss-btn.primary{
  background:linear-gradient(105deg,color-mix(in srgb,var(--yc-theme,#e056fd) 82%,#3d91b8),color-mix(in srgb,var(--yc-theme,#e056fd) 52%,#2e718f))!important;
  border:1px solid color-mix(in srgb,var(--yc-theme,#e056fd) 78%,#5d92a8)!important;
  color:#fff!important;
  text-shadow:0 1px 1px rgba(0,0,0,.3)!important;
}
html body .yc-ss-note{
  border-left-color:var(--yc-theme,#e056fd)!important;
  background:color-mix(in srgb,var(--yc-theme,#e056fd) 7%,#0b1923)!important;
}
</style>
`;

export function withVoiceThemePolish(html){
  for(const marker of ['id="voiceControls"','id="voiceConnectionPanel"','--yc-theme',"async function ycOpenAppSettings()"])
    if(!html.includes(marker))throw Error('Voice theme polish insertion boundary missing: '+marker);
  if(html.includes('ycVoiceThemePolishStyle'))return html;
  const appSettingsClose=";$('closeModal').onclick=closeModal;const root=$('ycAppSettingsSections');";
  const appSettingsClosePatched=";$('closeModal').onclick=closeModal;const ycAppSettingsBack=$('modalRoot')?.querySelector('.modal-back');if(ycAppSettingsBack)ycAppSettingsBack.addEventListener('pointerdown',e=>{if(e.target===ycAppSettingsBack)closeModal()});const root=$('ycAppSettingsSections');";
  if(!html.includes(appSettingsClose))throw Error('App settings backdrop-close boundary missing');
  html=html.replace(appSettingsClose,appSettingsClosePatched);
  return html.replace('</head>',style+'\n</head>');
}
