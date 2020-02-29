var notes    = 0;
var settings = new Object;
var defaults = { // default settings
	'Realtime Loader'      : true,
	'CSS3 Animation'       : true,
	'Delay Open Preview'   : 50,
	'Delay Close Preview'  : 800,
	'Desktop Notification' : true,
	'Preloaded Pages Count': 1,
	'Picture Viewer'       : 2,
	'Scroll Top View'      : true,
	'Upload Post Delay'    : 5,
	'Code Block Short Size': 255
};

const openPorts = new Object;
const initStor  = new Promise(resolve => {
	// load settings
	chrome.storage.onChanged.addListener(items => {
		const data = {};
		for (const key in items) {
			data[key] = settings[key] = items[key].newValue;
		}
		for (const id in openPorts) {
			openPorts[id].postMessage({ name: 'settings-change', data });
		}
	});
	chrome.storage.sync.get(defaults, items => {
		for (const key in items) {
			settings[key] = items[key];
		}
		resolve();
	});
});

if ('onSuspend' in chrome.runtime) {
	chrome.runtime.onSuspend.addListener(() => {
		chrome.browserAction.setBadgeBackgroundColor({ color: '#e5be5b' }); //#369e1b
		for (const id in openPorts) {
			openPorts[id].disconnect();
		}
	});
}
chrome.notifications.onClicked.addListener(openTab);
chrome.runtime.onMessage.addListener(messageHandler);
chrome.runtime.onConnect.addListener(port => {
	const id = port.sender.tab.id;
	(openPorts[id] = port).onDisconnect.addListener(() => {
		delete openPorts[id];
	});
	initStor.then(() => port.postMessage({ name: 'connection-resolve', data: settings }));
});

if ('setBadgeTextColor' in chrome.browserAction) {
	chrome.browserAction.setBadgeTextColor({ color: '#ffffff' });
}
chrome.browserAction.setBadgeBackgroundColor({ color: '#3d96ab' });
chrome.browserAction.getBadgeText({}, label => {
	if (label > 0)
		notes = Number(label);
});
chrome.alarms.onAlarm.addListener(getNotifications);
chrome.alarms.create('check-lor-notifications', {
	when: Date.now() + 1e3
});
/* chrome.webRequest.onBeforeRequest.addListener(
	() => new Object({ cancel: true }),
	{ urls: [
		'*://www.linux.org.ru/js/highlight.pack.js',
		'*://www.linux.org.ru/js/addComments.js',
		'*://www.linux.org.ru/js/realtime.js',
		'*://www.linux.org.ru/js/lor.js*'
	]},
	['blocking']
); */

const empty_Url = [
	'about:newtab',
	'about:blank',
	'about:home',
	'chrome://startpage/',
	'chrome://newtab/'
];

function onGetTabs(tabs) {
	// If exists a tab with URL == `notify_Url` then we switches to this tab.
	var tab = tabs[0];
	if (tab) {
		chrome.tabs.reload(tab.id);
		chrome.tabs.update(tab.id, { active: true }, clearNotes);
	} else {
		chrome.tabs.query({}, onGetAllTabs);
	}
}
function onGetAllTabs(tabs) {
	/// If opened a new tab (or the start page) then we goes to the `notify_Url`.
	for (let tab of tabs) {
		if (empty_Url.includes(tab.url)) {
			chrome.tabs.update(tab.id, { url: 'https://www.linux.org.ru/notifications', active: true }, clearNotes);
			return;
		}
	}
	chrome.tabs.create({ url: 'https://www.linux.org.ru/notifications' }, clearNotes);
}
function openTab() {
	chrome.tabs.query({ url: '*://www.linux.org.ru/notifications' }, onGetTabs);
}
function clearNotes() {
	notes = 0;
	chrome.browserAction.setBadgeText({ text: '' });
	for (const id in openPorts) {
		openPorts[id].postMessage({ name: 'new-notes', data: ''});
	}
}

function messageHandler({ action }, { tab }) {
	// check
	switch (action) {
		case 'l0rNG-settings':
			openPorts[tab.id].postMessage({ name: 'settings-change', data: settings });
			break;
		case 'l0rNG-reset':
			clearNotes();
			break;
		case 'l0rNG-reval':
			chrome.alarms.get('check-lor-notifications', alarm => {
				!alarm && getNotifications();
			});
			openPorts[tab.id].postMessage({ name: 'new-notes', data: notes ? '('+ notes +')' : '' });
			break;
		case 'l0rNG-checkNow':
			chrome.alarms.clear('check-lor-notifications');
			getNotifications();
			break;
	}
}

function getNotifications() {

	fetch('https://www.linux.org.ru/notifications-count', {
		credentials: 'same-origin',
		method: 'GET'
	}).then(
		response => {
			if (response.ok) {
				response.json().then(sendNotify);
			}
			if (response.status < 400) {
				chrome.alarms.create('check-lor-notifications', {
					delayInMinutes: 1
				});
			} else if (response.status >= 500) {
				chrome.alarms.create('check-lor-notifications', {
					delayInMinutes: 5
				});
			}
		}
	);
}

function sendNotify(count) {
	if ((notes = count) && settings['Desktop Notification']) {
		chrome.notifications.create('lorify-ng', {
			type    : 'basic',
			title   : 'LINUX.ORG.RU',
			message : count +' новых ответов',
			iconUrl : './icons/penguin-64.png'
		});
	}
	chrome.browserAction.setBadgeText({ text: count ? count.toString() : '' });
	for (const id in openPorts) {
		openPorts[id].postMessage({ name: 'new-notes', data: count ? '('+ count +')' : '' });
	}
}
