/* lorify-ng background script */
const defaults = Object.freeze({ // default settings
	'Realtime Loader'      : true,
	'CSS3 Animation'       : true,
	'Delay Open Preview'   : 50,
	'Delay Close Preview'  : 800,
	'Desktop Notification' : 1,
	'Preloaded Pages Count': 1,
	'Picture Viewer'       : 2,
	'Scroll Top View'      : true,
	'Upload Post Delay'    : 5,
	'Code Block Short Size': 15,
	'Code Highlight Style' : 0
});

var notes = 0;

var codestyles  = null;
const settings  = Object.assign({}, defaults);
const openPorts = new Array;
const loadStore = typeof browser === 'object' ?
	// load settings
	browser.storage.local.get() : new Promise(resolve => {
		chrome.storage.local.get(null, resolve)
	});
	loadStore.then(items => {
		for (const key in items) {
			settings[key] = items[key];
		}
	});

if ('onSuspend' in chrome.runtime) {
	chrome.runtime.onSuspend.addListener(() => {
		setBadge({ color: '#e5be5b' });
		for (const port of openPorts) {
			port.disconnect();
		}
	});
}

chrome.notifications.onClicked.addListener(() => openTab(
	`${ settings['Desktop Notification'] == 2 ? '#' : '/' }notifications`, 'reload-page')
);
chrome.runtime.onConnect.addListener(port => {
	port.onMessage.addListener(messageHandler);
	port.onDisconnect.addListener(discon => {
		openPorts.splice(openPorts.indexOf(discon), 1);
	});
	openPorts.push(port);
	loadStore.then(() => port.postMessage({ name: 'connection-resolve', data: settings }));
	if (!codestyles)
		port.postMessage({ name: 'need-codestyles' })
});

const setBadge = 'setBadgeText' in chrome.browserAction ? (
	badge => {
		if ('setBadgeTextColor' in badge) {
			badge.setBadgeTextColor({ color: '#ffffff' });
		}
		badge.setBadgeBackgroundColor({ color: '#3d96ab' });
		badge.getBadgeText({}, label => {
			if (label > 0)
				notes = Number(label);
		});
		return opts => {
			if ('text'  in opts) badge.setBadgeText(opts); else
			if ('color' in opts) badge.setBadgeBackgroundColor(opts);
		}
	}
)(chrome.browserAction) : () => void 0;

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

function openTab(uri = '', action = '') {

	const idx = uri.search(/\?|\#/),
	     path = idx < 0 ? uri : uri.substring(0, idx),
	   origin = path ? 'https://www.linux.org.ru' : chrome.runtime.getURL('/settings.html');

	for (const port of openPorts) {
		const { url, id } = port.sender.tab || '';
		if (url && url.includes((path || origin))) {
			chrome.tabs.update(id, { active: true });
			if (action === 'reload-page') {
				port.disconnect();
				chrome.tabs.reload(id);
			} else
				port.postMessage({ name: action, data: uri });
			return;
		}
	}
	chrome.tabs.query({}, tabs => {

		const full_url = { active: true, url: origin + uri };
		const empty_Rx = new RegExp('^'+
			'about:(?:newtab|blank|home)|'+
			'chrome://(?:newtab|startpage)/?'+ 
			(path ? '|https?://www.linux.org.ru/?' : '')+
		'$');

		let tab_id = -1, empty_id = -1;
		for (const { id, url } of tabs) {
			if (empty_Rx.test(url)) {
				empty_id = id;
				break;
			}
		}
		if (path) {
			for (const { id, url } of tabs) {
				if (url.includes('://www.linux.org.ru'+ path)) {
					tab_id = id;
					break;
				}
			}
		}
		if (tab_id !== -1 || empty_id !== -1) {
			chrome.tabs.update(tab_id !== -1 ? tab_id : empty_id, full_url);
		} else {
			chrome.tabs.create(full_url);
		}
	});
}

function messageHandler({ action, data }, port) {
	// check
	switch (action) {
		case 'l0rNG-setts-reset':
			changeSettings(defaults);
			break;
		case 'l0rNG-setts-change':
			changeSettings(data, openPorts.indexOf(port));
			break;
		case 'l0rNG-notes-reset':
			updNoteStatus(0);
			break;
		case 'l0rNG-codestyles':
			codestyles = data;
			break;
		case 'l0rNG-open-tab':
			openTab(data, 'scroll-to-comment');
			break;
		case 'l0rNG-reval':
			if ( notes !== data )
				updNoteStatus(data);
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
				response.json().then( count => {
					if ( notes !== count )
						updNoteStatus(count);
				});
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

function updNoteStatus(count) {
	if ( count > notes && settings['Desktop Notification'] ) {
		chrome.notifications.create('lorify-ng', {
			type    : 'basic',
			title   : 'LINUX.ORG.RU',
			message : count +' новых сообщений',
			iconUrl : 'icons/penguin-mono.svg'
		});
	}
	setBadge({ text: (notes = count) ? count.toString() : '' });
	openPorts.forEach(port => {
		port.postMessage({ name: 'notes-count-update', data: count })
	});
}
function changeSettings(newSetts, sIdx = -1) {
	for (let i  =  0; i < openPorts.length; i++) {
		if ( i !== sIdx )
			openPorts[i].postMessage({ name: 'settings-change', data: newSetts });
	}
	Object.assign(settings, newSetts);
	chrome.storage.local.set(newSetts);
}
