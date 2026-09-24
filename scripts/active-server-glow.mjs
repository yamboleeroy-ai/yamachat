// Visual-only active-server styling. No navigation, chat, voice or lifecycle logic.
const oldBlock=`.yc-v3-ribbon .server[data-community].active{
 border-color:color-mix(in srgb,var(--yc-server-color,#70e4e8) 80%,white)!important;
 background:linear-gradient(135deg,color-mix(in srgb,var(--yc-server-color,#70e4e8) 22%,#07131d),#091722 65%,color-mix(in srgb,var(--yc-server-color,#70e4e8) 12%,#050d15))!important;
 box-shadow:inset 3px 0 0 var(--yc-server-color,#70e4e8),inset 0 0 22px color-mix(in srgb,var(--yc-server-color,#70e4e8) 12%,transparent),0 0 20px color-mix(in srgb,var(--yc-server-color,#70e4e8) 24%,transparent)!important;
}`;

const newBlock=`/* ACTIVE SERVER GLOW 1.0.83 — visual-only, uses existing .active state */
.yc-v3-ribbon .server[data-community].active{
 border-color:color-mix(in srgb,var(--yc-theme,#35e7ff) 68%,#8b5cf6)!important;
 background:
   linear-gradient(145deg,rgba(53,231,255,.10),rgba(9,24,36,.98) 48%,rgba(139,92,246,.11)),
   linear-gradient(135deg,color-mix(in srgb,var(--yc-server-color,#70e4e8) 12%,#07131d),#07131d)!important;
 box-shadow:
   inset 0 0 0 1px rgba(139,92,246,.18),
   inset 4px 0 14px rgba(53,231,255,.10),
   inset -3px 0 12px rgba(139,92,246,.09),
   0 0 12px rgba(53,231,255,.16),
   0 0 20px rgba(139,92,246,.12)!important;
 filter:brightness(1.06) saturate(1.08);
}
.yc-v3-ribbon .server[data-community].active::after{
 inset:0!important;right:0!important;bottom:0!important;width:auto!important;height:auto!important;border-radius:inherit!important;
 border:1px solid rgba(188,105,246,.24)!important;
 box-shadow:inset -1px 0 rgba(79,220,240,.32)!important;
 pointer-events:none!important;
}
.yc-v3-ribbon .server[data-community].active .yc-v3-community-mark{
 box-shadow:
   inset 0 1px 0 #ffffff12,
   0 0 0 1px rgba(53,231,255,.12),
   0 0 12px rgba(139,92,246,.14)!important;
}`;

export function withActiveServerGlow(html){
  if(html.includes('ACTIVE SERVER GLOW 1.0.83')) return html;
  if(!html.includes(oldBlock)) throw Error('Stable active-server CSS block not found');
  return html.replace(oldBlock,newBlock);
}
