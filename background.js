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
const openPorts = new Set;
const isFirefox = navigator.userAgent.includes('Firefox');
const loadStore = isFirefox ?
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
		openPorts.clear();
	});
}

chrome.notifications.onClicked.addListener(() => {
	const ismob = Number(settings['Desktop Notification']) === 2;
	openTab(`${ ismob ? '#' : 'lor://' }notifications`,
	            ismob ? 'notes-show' : 'rel');
});
chrome.runtime.onConnect.addListener(port => {
	port.onMessage.addListener(messageHandler);
	port.onDisconnect.addListener(() => {
		openPorts.delete(port);
	});
	openPorts.add(port);
	loadStore.then(() => port.postMessage({ action: 'connection-resolve', data: settings }));
	if (!codestyles)
		port.postMessage({ action: 'need-codestyles', data: null });
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

const queryScheme = isFirefox
   ? url => browser.tabs.query({ url })
   : url => new Promise(res => void chrome.tabs.query({ url }, res))

const matchEmptyOr = (tabs, m_uri = '', m_rx = '') => new Promise(resolve => {

	const empty_Rx = new RegExp(m_rx ? m_rx : '^'+ 
		(isFirefox ? 'about:(?:newtab|home)$' : 'chrome://.*(?:newtab|startpage)') +
	'');

	let tab_id = -1;
	for (const { id, url } of tabs) {
		if (m_uri && url.includes(m_uri)) {
			tab_id = id;
			break;
		} else if (empty_Rx.test(url))
			tab_id = id;
	}
	resolve(tab_id);
});

function openTab(uri = '', action = '') {

	let schi = uri.search(/\?|\#/);
	if (schi === -1)
	    schi = uri.length;

	const lor = uri.startsWith('lor:') ? 5 : 0,
	     path = uri.substring(lor, schi),
	   origin = lor ? '://www.linux.org.ru'+ path : chrome.runtime.getURL('/settings.html'),
	     href = lor ? 'https' + origin + uri.substring(schi) : origin + uri;

	for (const port of openPorts) {
		const { url, id } = port.sender.tab || '';
		if (url && url.includes(origin)) {
			chrome.tabs.update(id, { active: true });
			if (action === 'rel') {
				chrome.tabs.reload(id);
			} else
				port.postMessage({ action, data: uri.substring(lor) });
			return;
		}
	}
	const fin = tab_id => {
		if (tab_id !== -1 ) {
			chrome.tabs.update(tab_id, { active: true, url: href });
		} else
			chrome.tabs.create({ active: true, url: href });
	}
	if (lor) {
		queryScheme(['*://www.linux.org.ru/', '*'+ origin +'/*']).then(
			tabs => matchEmptyOr(tabs, origin, '^https?://www.linux.org.ru/?$')
		).then(lor_id => {
			if(lor_id !== -1) {
				chrome.tabs.update(lor_id, { active: true, url: href });
			} else
			 	queryScheme().then(tabs => matchEmptyOr(tabs)).then(fin);
		});
	} else {
		queryScheme().then(tabs => matchEmptyOr(tabs, origin)).then(fin);
	}
}

function messageHandler({ action, data }, port) {
	// check
	switch (action) {
		case 'l0rNG-setts-reset':
			changeSettings(defaults);
			break;
		case 'l0rNG-setts-change':
			changeSettings(data, port);
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
			if ( notes < data || data > notes )
				updNoteStatus(Number(data));
		case 'l0rNG-checkNow':
			chrome.alarms.clear('check-lor-notifications');
			getNotifications();
			break;
		case 'l0rNG-extra-sets':
			if (codestyles)
				port.postMessage({ action: 'code-styles-list', data: codestyles });
			if (notes)
				port.postMessage({ action: 'notes-count-update', data: notes });
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
					if ( notes < count || count > notes )
						updNoteStatus(Number(count));
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

function updNoteStatus(count = 0) {
	if ( count > notes && settings['Desktop Notification'] ) {
		chrome.notifications.create('lorify-ng', {
			type    : 'basic',
			title   : 'LINUX.ORG.RU',
			message : count +' новых сообщений',
			iconUrl : 'icons/penguin-mono.svg'
		});
	}
	setBadge({ text: (notes = count) ? count.toString() : '' });
	for (const port of openPorts) {
		port.postMessage({ action: 'notes-count-update', data: count });
	}
}
function changeSettings(newSetts, exclupe = null) {
	for (const port of openPorts) {
		if ( port !== exclupe )
			port.postMessage({ action: 'settings-change', data: newSetts });
	}
	Object.assign(settings, newSetts);
	chrome.storage.local.set(newSetts);
}
