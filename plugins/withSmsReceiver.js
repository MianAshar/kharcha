/**
 * Expo Config Plugin — registers the SmsReceiver BroadcastReceiver from
 * react-native-android-sms-listener in the Android manifest so incoming SMS
 * broadcasts are forwarded to the JS layer.
 *
 * This only touches AndroidManifest.xml; no other native changes are needed
 * because the Java module is auto-linked by React Native's autolinking.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const SMS_RECEIVER_CLASS = 'com.centaurwarchief.smslistener.SmsReceiver';
const SMS_ACTION = 'android.provider.Telephony.SMS_RECEIVED';

/** @param {import('@expo/config-plugins').ExpoConfig} config */
function withSmsReceiver(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return cfg;

    if (!application.receiver) application.receiver = [];

    const alreadyAdded = application.receiver.some(
      (r) => r.$?.['android:name'] === SMS_RECEIVER_CLASS
    );

    if (!alreadyAdded) {
      application.receiver.push({
        $: {
          'android:name': SMS_RECEIVER_CLASS,
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' },
            action: [{ $: { 'android:name': SMS_ACTION } }],
          },
        ],
      });
    }

    return cfg;
  });
}

module.exports = withSmsReceiver;
