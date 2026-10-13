import java.util.Properties

plugins { id("com.android.application") }

android {
    namespace = "eu.yamachat.yamasearch"
    compileSdk = 35
    defaultConfig {
        applicationId = "eu.yamachat.yamasearch"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            val props = Properties()
            val keyFile = rootProject.file("keystore.properties")
            if (keyFile.exists()) {
                keyFile.inputStream().use(props::load)
                signingConfig = signingConfigs.create("release") {
                    storeFile = rootProject.file(props.getProperty("storeFile"))
                    storePassword = props.getProperty("storePassword")
                    keyAlias = props.getProperty("keyAlias")
                    keyPassword = props.getProperty("keyPassword")
                }
            }
        }
    }
}
