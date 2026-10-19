// Browser/native settings adapter. Never reads or writes the Electron settings file.
window.yamachatDesktop={
  async getAppSettings(){try{return JSON.parse(localStorage.getItem('yc_platform_settings')||'{}')}catch{return {}}},
  async setAppSetting(key,value){
    const settings=await this.getAppSettings();
    if(key==='uiThemeColorForUser')settings.uiThemeColors={...settings.uiThemeColors,[value.userId]:value.color};
    else if(key==='serverCardBackground')settings.serverCardBackgrounds={...settings.serverCardBackgrounds,[value.communityId]:value.background};
    else settings[key]=value;
    localStorage.setItem('yc_platform_settings',JSON.stringify(settings));return settings;
  }
};
