/**
 * Persian catalog: the default language and the last fallback of `t()`.
 *
 * A flat object of stable, dotted English keys grouped by screen. Values are plain text (never HTML);
 * `{name}` marks a parameter. The Persian default text inside index.html must equal the value here
 * (tests/unit/i18n-html.test.mjs checks it), so the first paint and the offline path never wait for JS.
 */

export const fa = {
    // ---- Document: <title> and meta description
    'meta.description': 'بازی دورهمی و معمایی جاسوس (Spyfall) - نسخه پیشرفته تحت وب بدون نیاز به نصب',
    'meta.title': 'بازی دورهمی جاسوس',

    // ---- App chrome: cover mode and install button
    'panic.shield.aria': 'خروج از حالت پوشش',
    'panic.shield.text': 'حالت پوشش فعال است (برای خروج دو بار ضربه بزنید)',
    'panic.open.aria': 'فعال‌سازی حالت پوشش امنیتی',
    'panic.open.text': '🛡️ حالت پوشش',
    'install.aria': 'نصب برنامه روی گوشی',
    'install.text': '⬇️ نصب برنامه روی گوشی',

    // ---- Hand-over gate
    'handoff.caption': 'گوشی را به این بازیکن بده:',
    'handoff.cancel': 'بازگشت',

    // ---- Header bar
    'header.sound.aria': 'قطع و وصل صدا',
    'header.theme.label': 'انتخاب پوسته',

    // ---- Theme names
    'theme.default': '🌌 نئون کهکشانی',
    'theme.noir': '🕵️ نوآر کلاسیک',
    'theme.classic': '🎞️ سینمای کلاسیک',
    'theme.emerald': '🌲 جنگل زمرد',
    'theme.crimson': '🔥 شعله سرخ',
    'theme.sunset': '🌇 میراژ غروب',
    'theme.cyber': '🤖 سایبرپانک',
    'theme.ocean': '🧊 اقیانوس یخی',

    // ---- Unfinished-match banner
    'recovery.message': '⚠️ یک مسابقه نیمه‌کاره یافت شد.',
    'recovery.restore': 'ادامه مسابقه',
    'recovery.discard': 'شروع تازه',

    // ---- Welcome screen
    'welcome.title': '🕵️ بازی جاسوس',
    'welcome.tagline': 'یک بازی معمایی، هیجانی و دورهمی. قبل از اینکه جاسوس کلمه رمز را کشف کند، او را شناسایی کنید!',
    'welcome.start.aria': 'شروع بازی',
    'welcome.start.label': 'شروع بازی',
    'welcome.start.caption': 'دست‌به‌دست کردن یک گوشی در جمع دورهمی',
    'welcome.words': '✏️ بانک کلمات سفارشی',
    'welcome.credit.author.aria': 'صفحه سازنده',
    'welcome.credit.author': 'ساخته شده توسط مهدی',
    'welcome.credit.support.aria': 'حمایت مالی از سازنده',

    // ---- Setup screen
    'setup.title': 'تنظیمات مسابقه',
    'setup.players.label': 'تعداد کل بازیکنان:',
    'setup.spies.label': 'تعداد جاسوس‌ها:',
    'setup.categories.label': 'دسته‌بندی موضوعات کلمات:',
    'setup.categories.all': 'همه موضوعات (+700 کلمه)',
    'setup.cat.places': 'اماکن و فضاها',
    'setup.cat.jobs': 'مشاغل و حرفه‌ها',
    'setup.cat.foods': 'غذاها و خوراکی‌ها',
    'setup.cat.objects': 'اشیاء و فناوری',
    'setup.cat.vehicles': 'وسایل نقلیه',
    'setup.cat.animals': 'حیوانات و طبیعت',
    'setup.cat.sports': 'ورزش و بازی‌ها',
    'setup.cat.events': 'رویدادها و پدیده‌ها',
    'setup.cat.custom': 'کلمات سفارشی',
    'setup.difficulty.label': 'سطح دشواری:',
    'setup.difficulty.all': 'همه سطوح',
    'setup.difficulty.easy': 'ساده',
    'setup.difficulty.medium': 'متوسط',
    'setup.difficulty.hard': 'سخت',
    'setup.timer.label': 'زمان گفتگو (دقیقه):',
    'setup.reveal.label': 'نحوه مشاهده کارت:',
    'setup.reveal.click': 'کلیک ساده',
    'setup.reveal.hold': 'نگه‌داشتن انگشت (Hold)',
    'setup.hints.label': 'نوع راهنمای جاسوس:',
    'setup.hints.note': 'می‌توانید چند مورد را همزمان فعال نگه دارید؛ هر دور یکی از موارد فعال به‌صورت تصادفی انتخاب می‌شود.',
    'setup.hint.related': 'کلمه مرتبط',
    'setup.hint.category': 'نام موضوع',
    'setup.hint.firstLetter': 'حرف اول کلمه',
    'setup.hint.none': 'بدون راهنما',
    'setup.hint.noneTag': 'سخت',
    'setup.toggle.detective': 'کارآگاه',
    'setup.toggle.known': 'همکاران',
    'setup.toggle.fool': 'ساده‌لوح',
    'setup.toggle.director': 'دستیار نوبت',
    'setup.toggle.oneword': 'تک‌کلمه‌ای',
    'setup.toggle.quests': 'ماموریت',
    'setup.toggle.wager': 'شرط‌بندی',
    'setup.toggle.sudden': 'حذف درجا',
    'setup.toggle.lastChance': 'شانس آخر جاسوس',
    'setup.toggle.limit': 'سقف زنگ',
    'setup.toggle.roleRevealConfirm': 'تأییدیه دیدن نقش',
    'setup.toggle.voteConfirm': 'تأییدیه ثبت رأی',
    'setup.toggle.quickVoting': 'رای‌گیری سریع',
    'setup.maxVotes.label': 'حداکثر سهمیه زنگ اضطراری',
    'setup.maxVotes.placeholder': 'حداکثر سهمیه زنگ اضطراری',
    'setup.names.label': 'اسامی بازیکنان حاضر:',
    'setup.names.reset': '🗑️ پیش‌فرض',
    'setup.start': 'شروع مسابقه و توزیع کارت‌ها 🚀',
    'setup.back': 'بازگشت',

    // ---- Role reveal screen
    'reveal.title': 'کارت‌های محرمانه',
    'reveal.startDiscussion': 'همه دیدند؛ شروع تایمر گفتگو ⏳',

    // ---- Discussion timer screen
    'timer.oneword.banner': '⚡ قانون تک‌کلمه‌ای فعال است! فقط ۱ کلمه پاسخ دهید.',
    'timer.director.title': '🎯 نوبت سوال و جواب هوشمند:',
    'timer.director.next': 'نوبت بعدی 🔄',
    'timer.emergency': '🚨 اعلام زنگ اضطراری و رای‌گیری',
    'timer.end': 'پایان مسابقه و کارنامه 🏆',

    // ---- Voting screen
    'vote.title': 'رای‌گیری اخراج',
    'vote.cancel': 'انصراف و بازگشت به گفتگو',

    // ---- Wager screen
    'wager.title': '🎲 شرط‌بندی روی هویت مظنون',
    'wager.suspect': 'مظنون اخراج:',

    // ---- Spy guess screen
    'guess.title': '🎯 فرصت حدس کلمه رمز!',
    'guess.identified': 'شناسایی شد!',
    'guess.announce.pre': 'جاسوس کلمه حدس‌زده را به صورت',
    'guess.announce.verbal': 'شفاهی',
    'guess.announce.post': 'به جمع اعلام کند.',
    'guess.verdict.prompt': 'نتیجه اعلام شفاهی جاسوس را ثبت کنید:',
    'guess.correct': '✅ حدس درست بود',
    'guess.wrong': '❌ حدس اشتباه بود',
    'guess.pass': '⚪ حدس نزد / انصراف داد',
    'guess.note': 'حدس درست: جاسوس‌ها دور را می‌برند. غلط یا انصراف: بازی طبق قانون ادامه پیدا می‌کند.',

    // ---- Round result screen
    'result.table.caption': 'جدول تغییرات امتیاز دست فعلی',
    'result.col.player': 'بازیکن',
    'result.col.change': 'تغییر',
    'result.col.total': 'مجموع',
    'result.next': 'دست بعدی 🔁',
    'result.end': 'اتمام مسابقه و کارنامه نهایی 🏆',

    // ---- Final scorecard screen
    'leaderboard.title': '🏆 تابلوی افتخارات و کارنامه',
    'leaderboard.table.caption': 'جدول کارنامه نهایی مسابقه',
    'leaderboard.col.rank': 'رتبه',
    'leaderboard.col.player': 'بازیکن',
    'leaderboard.col.wins': 'پیروزی‌ها',
    'leaderboard.col.score': 'امتیاز نهایی',
    'leaderboard.exportImage': '📸 ذخیره عکس کارنامه',
    'leaderboard.details': '📋 دیدن جزئیات کامل بازیکنان',
    'leaderboard.newMatch': 'مسابقه جدید 🔄',

    // ---- Modals: info
    'modal.info.close': 'متوجه شدم',

    // ---- Modals: custom words
    'words.title': '✏️ مدیریت کلمات سفارشی',
    'words.word.placeholder': 'کلمه اصلی (مثلاً: بیمارستان)',
    'words.fool.placeholder': 'کلمه ساده‌لوح (مثلاً: درمانگاه)',
    'words.hint.placeholder': 'راهنمای جاسوس (یک کلمه، مثلاً: پزشک)',
    'words.add': '➕ افزودن کلمه',
    'words.export': '📤 پشتیبان JSON',
    'words.import': '📥 بارگذاری JSON',
    'words.registered': 'کلمات ثبت‌شده (',
    'words.close': 'بستن',

    // ---- Modals: player details
    'details.title': '📋 جزئیات کامل بازیکنان',
    'details.subtitle': 'آماری که در طول مسابقه پشت صحنه ثبت شده',
    'details.close': 'بستن',

    // ---- Modals: vote confirmation
    'voteConfirm.title': 'تایید رای',
    'voteConfirm.pre': 'آیا مطمئنید می‌خواهید به',
    'voteConfirm.post': 'رای دهید؟',
    'voteConfirm.yes': 'بله، ثبت رای',
    'voteConfirm.no': 'انصراف',

    // ---- Modals: role card
    'role.fellowSpies': '🕵️ همکاران جاسوس:',
    'role.detective.heading': '🔍 استعلام هویت:',
    'role.detective.inquiry': 'استعلام هویت',
    'role.quest.heading': '🎯 ماموریت جانبی:',
    'role.close': 'دیدم و مخفی کن',

    // ---- Modals: generic confirm
    'confirm.yes': 'بله',
    'confirm.no': 'انصراف',

    // ---- Modals: elimination reveal
    'elim.continue': 'ادامه ⏭️',

    // ---- Modals: tie breaker
    'tie.badge': 'تساوی آرا!',
    'tie.note': 'پس می‌ریم سراغ شانس... 🍀',
    'tie.continue': 'ادامه ⏭️',
    'tie.wheel.title': 'چرخ شانس 🎡',

    // ---- Help texts shown by the (i) buttons
    'info.detective.title': '🔍 نقش کارآگاه',
    'info.detective.text': 'کارآگاه یکی از شهروندان آگاه است. در هر دور، او می‌تواند مخفیانه یک‌بار هویت یکی از حاضرین را استعلام بگیرد تا مطمئن شود او جاسوس است یا شهروند بی‌گناه.',
    'info.knownSpies.title': '🕵️ همکاران جاسوس',
    'info.knownSpies.text': 'در بازی‌های با بیش از ۱ جاسوس، فعال‌بودن این گزینه باعث می‌شود همه جاسوس‌ها اسامی یکدیگر را در کارت خود مشاهده کرده و هماهنگ تبانی کنند.',
    'info.fool.title': '👤 نقش ساده‌لوح',
    'info.fool.text': 'ساده‌لوح تصور می‌کند یک شهروند معمولی است؛ اما کلمه‌ای که روی کارتش می‌بیند اندکی با کلمه سایر شهروندان فرق دارد (مثلاً درمانگاه به‌جای بیمارستان)! این تفاوت ناخواسته او را مظنون می‌کند.',
    'info.director.title': '🎯 دستیار نوبت',
    'info.director.text': 'سیستم هوشمند بازی در طول زمان گفتگو، به صورت پویا مشخص می‌کند چه کسی باید از چه کسی سوال بپرسد تا جریان بازی پیوسته و بدون سکوت ادامه یابد.',
    'info.oneword.title': '⚡ قانون تک‌کلمه‌ای',
    'info.oneword.text': 'بازیکنان در پاسخ به هر پرسش فقط و فقط مجازند یک کلمه بیان کنند؛ ادای جملات بلند تخلف محسوب می‌شود.',
    'info.quests.title': '🎯 ماموریت‌های جانبی',
    'info.quests.text': 'علاوه بر نقش اصلی، یک چالش رفتاری خنده‌دار و مخفیانه به بازیکن داده می‌شود که انجام آن باعث مشکوک‌شدن رفتارش نزد دیگران می‌گردد.',
    'info.wager.title': '🎲 سیستم شرط‌بندی و امتیازات',
    'info.wager.text': 'نحوه امتیازدهی کلی بازی:\n• پیروزی شهروندان در دور: ۲+ امتیاز به همه شهروندان زنده\n• پیروزی جاسوس‌ها در دور: ۲+ امتیاز به همه جاسوس‌ها (به‌جز حدس‌زننده‌ی درست که فقط امتیاز حدس را می‌گیرد)\n• اخراج اشتباه شهروند بی‌گناه: ۱+ امتیاز بقا به جاسوس‌های زنده\n• حدس صحیح کلمه توسط جاسوس: دور به نفع جاسوس‌ها تمام می‌شود و حدس‌زننده بسته به سختی کلمه (آسان ۱، متوسط ۲، سخت ۳؛ کلمات سفارشی ۲) امتیاز می‌گیرد.\n\nنحوه کارکرد شرط‌بندی:\nهنگامی که یک مظنون با رأی‌گیری انتخاب می‌شود، بازیکنان دارای امتیاز مثبت می‌توانند بخشی از امتیازات خود را شرط ببندند که مظنون، جاسوس است. اگر مظنون واقعاً جاسوس باشد، بازیکن معادل شرط خود سود می‌گیرد (ضریب ۲ برابر بازگشت اصل و سود). اگر مظنون شهروند بی‌گناه باشد، امتیاز شرط‌بسته‌شده از بازیکن کسر می‌گردد.',
    'info.sudden.title': '🔥 حذف درجا (مرگ ناگهانی)',
    'info.sudden.text': 'اگر شهروندان در رأی‌گیری اشتباهاً به یک شهروند بی‌گناه رأی دهند و او اخراج شود، بازی در همان لحظه با پیروزی بلافاصله جاسوس‌ها به پایان می‌رسد.',
    'info.spyLastChance.title': '🎯 شانس آخر جاسوس',
    'info.spyLastChance.text': 'وقتی فعال باشد (پیش‌فرض)، جاسوسی که با رأی‌گیری شناسایی شد یک شانس آخر دارد و کلمهٔ اصلی را بلند به جمع می‌گوید. اگر درست بگوید، جاسوس‌ها دور را می‌برند. اگر غلط بگوید یا انصراف بدهد، بازی طبق قانون ادامه پیدا می‌کند (در بازی تک‌جاسوسی شهروندان برنده‌اند). وقتی غیرفعال باشد، قانون کلاسیک اجرا می‌شود: جاسوس شناسایی‌شده حدس آخر ندارد.',
    'info.voteLimit.title': '🚨 سقف زنگ اضطراری',
    'info.voteLimit.text': 'تعداد دفعاتی که بازیکنان اجازه دارند تایمر گفتگو را متوقف کرده و جمع را وادار به رأی‌گیری زودهنگام کنند را به عدد مشخصی محدود می‌سازد.',
    'info.roleRevealConfirm.title': '🔒 تأییدیه دیدن نقش',
    'info.roleRevealConfirm.text': 'وقتی فعال باشد (پیش‌فرض)، پیش از نمایش کارت نقش هر بازیکن، یک مرحلهٔ میانی ظاهر می‌شود تا مطمئن شوید گوشی واقعاً دست همان بازیکن است. وقتی غیرفعال باشد، با لمس نام بازیکن، کارت نقش او بلافاصله و بدون مرحلهٔ تاییدیه نمایش داده می‌شود — سریع‌تر است، اما احتیاط کمتری در برابر دیدن اشتباهی کارت توسط فرد دیگر دارد.',
    'info.voteConfirm.title': '🗳️ تأییدیه ثبت رأی',
    'info.voteConfirm.text': 'وقتی فعال باشد، پیش از نهایی‌شدن هر رأی، یک پیام تاییدیه نمایش داده می‌شود تا از انتخاب خود مطمئن شوید. وقتی غیرفعال باشد (پیش‌فرض)، با لمس نام مظنون، رأی بلافاصله و بدون نیاز به تایید اضافه ثبت می‌شود.',
    'info.quickVoting.title': '⚡ رای‌گیری سریع',
    'info.quickVoting.text': 'در حالت عادی، پیش از نمایش گزینه‌های رای‌گیری به هر بازیکن، از او خواسته می‌شود گوشی را در دست بگیرد و آمادگی‌اش را تایید کند. با فعال‌کردن رای‌گیری سریع، این مرحله حذف می‌شود و به محض رسیدن نوبت هر بازیکن، صفحهٔ رای‌گیری بلافاصله نمایش داده می‌شود. توجه: این گزینه جدا از «تأییدیه ثبت رأی» است — آن گزینه مربوط به پیام تاییدیهٔ نهایی، بعد از انتخاب مظنون، است.',
    'info.hintTypes.title': '🕵️ راهنمای جاسوس چیست؟',
    'info.hintTypes.text': 'جاسوس به‌جای کلمه اصلی، یکی از این راهنماها را می‌بیند:\n• کلمه مرتبط: یک کلمه نزدیک به کلمه اصلی\n• نام موضوع: فقط دسته‌بندی کلی کلمه\n• حرف اول کلمه: تنها حرف نخست کلمه اصلی\n• بدون راهنما: سخت‌ترین حالت، هیچ سرنخی داده نمی‌شود\n\nمی‌توانید چند مورد را هم‌زمان فعال کنید؛ هر دور یکی از موارد فعال به‌صورت تصادفی انتخاب می‌شود.'
};
