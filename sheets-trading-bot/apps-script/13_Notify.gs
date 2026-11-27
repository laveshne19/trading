/**
 * 13_Notify.gs — alerts.
 *
 * Email is the default because it needs no extra setup. Telegram is wired but
 * optional: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Script Properties
 * and it is used in addition to email. Telegram arrives in seconds, which
 * matters for an "unprotected position" alert.
 */

function notify_(subject, body) {
  var c = cfg();
  var text = body + '\n\n—\n' + fmtIst_(new Date()) + ' IST' +
             (c.DRY_RUN ? '  [DRY RUN]' : '  [LIVE]');

  try {
    var to = c.NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
    if (to) {
      MailApp.sendEmail({ to: to, subject: '[TradingBot] ' + subject, body: text });
    }
  } catch (e) {
    Logger.log('Email failed: ' + e.message);
  }

  try {
    var tok = props_().getProperty('TELEGRAM_BOT_TOKEN');
    var chat = props_().getProperty('TELEGRAM_CHAT_ID');
    if (tok && chat) {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
        method: 'post',
        payload: { chat_id: chat, text: subject + '\n\n' + text },
        muteHttpExceptions: true
      });
    }
  } catch (e) {
    Logger.log('Telegram failed: ' + e.message);
  }
}
