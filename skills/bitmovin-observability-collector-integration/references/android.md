# Android Collector (v3)

This is the **v3** collector (the v2 setup is deprecated). All collectors support Android 6+. Players:
Bitmovin (pre-integrated), ExoPlayer, Media3 ExoPlayer, THEOplayer. You need a basic working
player first. Examples in Kotlin (Java works the same way).

> Media3 ExoPlayer and legacy ExoPlayer are **different artifacts and different collector classes** — pick
> the one matching the engine the app actually uses.

---

## Path A — Bitmovin Player (pre-integrated)

Built into the Bitmovin Player since player `3.41.0`. No extra repo/dependency, no attach, no manual source
lifecycle — enable it at player creation:
```kotlin
val playerConfig = PlayerConfig()
val analyticsConfig = AnalyticsConfig(licenseKey = "<ANALYTICS_LICENSE_KEY>")
val player = Player(context, playerConfig, AnalyticsPlayerConfig.Enabled(analyticsConfig))
```

Metadata (`DefaultMetadata` source-independent at creation; `SourceMetadata` per source):
```kotlin
val defaultMetadata = DefaultMetadata(
    customUserId = "userId",
    customData = CustomData(customData1 = "appVersion4")
)
val player = Player(context, playerConfig, AnalyticsPlayerConfig.Enabled(analyticsConfig, defaultMetadata))

val sourceMetadata = SourceMetadata(
    title = "stream title",
    videoId = "exampleId",
    customData = CustomData(customData2 = "ExampleGenre")
)
val source = Source(sourceConfig, AnalyticsSourceConfig.Enabled(sourceMetadata))
player.load(source)
```

---

## Path B — Third-party players (ExoPlayer / Media3 / THEOplayer)

### Step 1 — Repositories
In your project `build.gradle`, add the Bitmovin release repo alongside Google + Maven Central:
```groovy
allprojects {
    repositories {
        mavenCentral()
        google()
        maven { url 'https://artifacts.bitmovin.com/artifactory/public-releases' }
    }
}
```

### Step 2 — Dependency (pick the one for your engine)
```groovy
dependencies {
    implementation 'com.bitmovin.analytics:collector-media3-exoplayer:{Version Number}' // Media3 ExoPlayer
    // implementation 'com.bitmovin.analytics:collector-exoplayer:{Version Number}'      // legacy ExoPlayer
    // implementation 'com.bitmovin.analytics:collector-theoplayer:{Version Number}'     // THEOplayer
}
```
Versions: https://developer.bitmovin.com/playback/docs/analytics-collector-android-releases — keep player
and collector current; for older players check the compatible collector on the collector's GitHub readme.

### Step 3 — Configure, create, attach, detach
The factory class differs per engine; the flow is identical: config → factory.create → set sourceMetadata →
attachPlayer → … → detachPlayer.
```kotlin
val analyticsConfig = AnalyticsConfig("<ANALYTICS_LICENSE_KEY>")

// Engine-specific factory:
val analyticsCollector = IMedia3ExoPlayerCollector.Factory.create(applicationContext, analyticsConfig)
// IExoPlayerCollector.Factory.create(applicationContext, analyticsConfig)        // legacy ExoPlayer
// ITHEOplayerCollector.create(applicationContext, analyticsConfig)               // THEOplayer (no .Factory)

analyticsCollector.sourceMetadata = SourceMetadata(title = "exampletitle", videoId = "exampleId")
analyticsCollector.attachPlayer(player)

// start playback AFTER attaching (engine-specific):
player.setMediaItem(mediaItem); player.prepare(); player.play()   // ExoPlayer / Media3
// player.source = exampleSource; player.play()                   // THEOplayer

// detach when done — e.g. before player.release()
analyticsCollector.detachPlayer()
```

### Step 4 — Source-change lifecycle
Detach → change metadata → swap source → re-attach → play:
```kotlin
analyticsCollector.detachPlayer()
analyticsCollector.sourceMetadata = SourceMetadata(title = "exampletitle2", videoId = "exampleId2")
player.setMediaItem(mediaItem2)            // or player.source = … / player.load(…)
analyticsCollector.attachPlayer(player)
player.prepare(); player.play()
```

---

## Per-program sessions on a continuous/live stream (`programChange`)

For a continuous live/linear stream where the program changes but the source does not, split the watch into
one session per program with `programChange(newSourceMetadata)` — it ends the current impression and starts a
new one without swapping the source or re-attaching. Available on every Android collector (Bitmovin,
ExoPlayer, Media3 ExoPlayer, THEOplayer) since collector **~v3.22.0**.
```kotlin
val next = SourceMetadata(videoId = "program-002", title = "Evening News", isLive = true)
collector.programChange(next)
```
Call it from the player thread (the API is not thread-safe); it is silently ignored if the collector is not
attached. `customUserId` (in `DefaultMetadata`) persists across programs. You need a handle to the collector
— on the third-party path you already hold it; for the pre-integrated Bitmovin Player, confirm the runtime
analytics accessor against the Player Android SDK reference (or integrate the collector manually to keep a
handle). This is distinct from the Step 4 source-change lifecycle (which is for an actual new source). Full
cross-platform details: `program-change.md`.

---

## Android-specific operational notes

- **Threading:** the collector API is **not thread-safe**. Call it only from the player's thread (usually
  the main thread). Cross-thread calls can silently produce inconsistent data.
- **Minification/obfuscation:** since `3.15.0` the collector uses `kotlinx.serialization`, so no consumer
  proguard rules are needed. Exception — if you call the API via reflection (e.g. a React Native wrapper):
  ```proguard
  -keep class com.bitmovin.analytics.api.** { *; }
  ```
- **Media3 `AbstractMethodError`** (default methods stripped from `AnalyticsListener` under some release
  configs): add to `gradle.properties`:
  ```properties
  android.useFullClasspathForDexingTransform = true
  ```

Examples: https://github.com/bitmovin/bitmovin-analytics-collector-android
Source page: https://developer.bitmovin.com/playback/docs/setup-analytics-android-v3
