// Apply to the current client; do not regenerate a client from old references.
export function withVoiceHotPathCleanup(html) {
  const edits = [
    [
      'try{nodes.src?.disconnect()}catch{}try{nodes.gain?.disconnect()}catch{}',
      'try{nodes.src?.disconnect()}catch{}try{nodes.compressor?.disconnect()}catch{}try{nodes.gain?.disconnect()}catch{}',
      2,
    ],
    [
      "if(profile)selfAvatar.innerHTML=rankAvatarHtml(profile,myStats,'avatar',selfPresenceState);else selfAvatar.textContent=initials(selfName)",
      "if(profile){const markup=rankAvatarHtml(profile,myStats,'avatar',selfPresenceState);if(selfAvatar.innerHTML!==markup)selfAvatar.innerHTML=markup}else{const text=initials(selfName);if(selfAvatar.textContent!==text)selfAvatar.textContent=text}",
      1,
    ],
  ];
  for (const [before, after, count] of edits) {
    const matches = html.split(before).length - 1;
    if (matches === 0 && html.split(after).length - 1 === count) continue;
    if (matches !== count) throw new Error('Voice hot-path boundary changed: ' + before);
    html = html.replaceAll(before, after);
  }
  return html;
}
