angular.module('MoneyNetwork')
    
    .controller('ChatCtrl', ['MoneyNetworkService', '$scope', '$rootScope', '$timeout', '$routeParams', '$location', 'safeApply',
        'chatEditTextAreaIdFilter', 'chatEditImgIdFilter', 'formatChatMessageFilter', 'shortChatTimeFilter', '$window', 'dateFilter', '$sce',
        'shortCertIdFilter', 'brFilter', 'shyFilter',
        function (moneyNetworkService, $scope, $rootScope, $timeout, $routeParams, $location, safeApply,
                  chatEditTextAreaId, chatEditImgId, formatChatMessage, shortChatTime, $window, date, $sce,
                  shortCertId, br, shy)
        {
            
            var self = this;
            var controller = 'ChatCtrl';
            //if (!MoneyNetworkHelper.getItem('userid')) {
            //    // not logged in - skip initialization of controller
            //    return;
            //}
            console.log(controller + ' loaded');
            // MoneyNetworkHelper.set_debug_all(true);
            $window.scrollTo(0, 0);

            function debug (key, text) { MoneyNetworkHelper.debug(key, text) }

            function sanitize (text) {
                return moneyNetworkService.sanitize(text) ;
            }

            // insert <br> into long notifications. For example JSON.stringify
            function z_wrapper_notification (array) {
                moneyNetworkService.z_wrapper_notification(array) ;
            } // z_wrapper_notification


            self.z = ZeroFrame ;

            self.is_logged_in = function () {
                if (!ZeroFrame.site_info) return false ;
                if (!ZeroFrame.site_info.cert_user_id) return false ;
                return MoneyNetworkHelper.getUserId();
            };

            // get user setup.
            self.setup = moneyNetworkService.get_user_setup() ;
            if (!self.setup.contact_filters) {
                // not logged in. Show all contacts
                self.setup.contact_filters = {
                    all: 'green',
                    new: 'green',
                    unverified: 'green',
                    verified: 'green',
                    ignore: 'green'
                } ;
            }
            if (!self.setup.hasOwnProperty('public_chat')) self.setup.public_chat = true ; // not logged in

            // two panel chat?
            (function(){
                var two_panel_chat = ($location.path().substr(0,6) == '/chat2') ;
                if (self.setup.two_panel_chat != two_panel_chat) {
                    // must be a direct link. update user setup
                    self.setup.two_panel_chat = two_panel_chat ;
                    moneyNetworkService.save_user_setup() ;
                }
            })() ;
            self.two_panel_chat_changed = function () {
                var pgm = controller + '.two_panel_chat_changed: ' ;
                moneyNetworkService.save_user_setup() ;
                // keep contact / group chat context when redirect between one and two panel chat pages
                console.log(pgm + '$location.path = ' + $location.path()) ;
                var contact, path1, path2, a_path, z_path ;
                if (self.group_chat) contact = find_group_chat_contact() ;
                else contact = self.contact ;
                // redirect to other chat page (chat / chat2 ). keep chat context and update angularJS and ZeroNet path
                path1 = self.setup.two_panel_chat ? '/chat2' : '/chat' ;
                if (!contact) path2 = '' ;
                else if ((contact.type == 'group') || (moneyNetworkService.is_old_contact(contact, true))) path2 = '/' + contact.unique_id ;
                else path2 = '/' + contact.cert_user_id ;
                a_path = path1 + path2 ;
                z_path = "?path=" + a_path ;
                $location.path(a_path);
                $location.replace();
                ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Chat", z_path]) ;
            };

            // contact removed from top of chat. see all chat messages
            self.see_all_chat = function () {
                var a_path, z_path ;
                clear_chat_filter_cache() ;
                self.contact = null ;
                self.group_chat = false ;
                self.group_chat_contacts.splice(self.group_chat_contacts.length) ;
                self.editing_grp_chat = false ;
                self.show_money = false ;
                a_path = self.setup.two_panel_chat ? '/chat2' : '/chat' ;
                z_path = "?path=" + a_path ;
                ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Chat", z_path]) ;
            }; // self.see_all_chat

            // group contact functions.
            // click on glyphicon-pushpin to edit participants in group chat
            // click on glyphicon-ok or send chat message when done editing chat group
            self.group_chat = false ;
            self.group_chat_contacts = [] ;
            self.editing_grp_chat = false ;

            // find group chat contact from self.group_chat_contacts array
            // params (create):
            // - false (default) - do not create pseudo group contact
            // - true - create pseudo group chat contact if pseudo group chat contact does not exists
            // returns:
            // - null - not group chat
            // - string - group chat unique_id - pseudo group chat contact does not exists (create != true)
            // - contact - contact or pseudo group chat contact
            function find_group_chat_contact (create) {
                var pgm = controller + '.find_group_chat_unique_id: ' ;
                if (self.group_chat_contacts.length == 0) return null ;
                if (self.group_chat_contacts.length == 1) return self.group_chat_contacts[0] ;
                // calculate group chat unique_id from participants in group chat
                // calculate last updated as max last updated for participants in group chat
                var i, j, participant, timestamp, last_updated, participants, participants_str, contact, password,
                    unique_id, public_avatars, index, avatar ;
                participants = [moneyNetworkService.get_my_unique_id()] ;
                for (i=0 ; i<self.group_chat_contacts.length ; i++) {
                    participant = self.group_chat_contacts[i] ;
                    participants.push(participant.unique_id) ;
                } // for i (participants)
                participants.sort() ;
                participants_str = JSON.stringify(participants) ;
                // console.log(pgm + 'group_chat_contact_unique_ids = ' + JSON.stringify(group_chat_contact_unique_ids)) ;

                // search for old chat group with identical participants
                contact = null ;
                last_updated = 0 ;
                for (i=0 ; i<self.contacts.length ; i++) {
                    if (self.contacts[i].type != 'group') continue ;
                    if (JSON.stringify(self.contacts[i].participants) != participants_str) continue ;
                    timestamp = MoneyNetworkHelper.get_last_online(self.contacts[i]) ;
                    if (timestamp > last_updated) {
                        contact = self.contacts[i] ;
                        last_updated = timestamp ;
                    }
                }
                if (contact) return contact ; // group contact already exists

                // console.log(pgm + 'group_unique_id = ' + group_unique_id) ;

                // create new pseudo chat group contact. assword will be send to group participants in send_msg
                password = moneyNetworkService.generate_random_password();
                unique_id = CryptoJS.SHA256(password).toString() ;
                public_avatars = MoneyNetworkHelper.get_public_avatars() ;
                index = Math.floor(Math.random() * public_avatars.length);
                avatar = public_avatars[index] ;
                contact = {
                    unique_id: unique_id,
                    cert_user_id: unique_id.substr(0,13) + '@moneynetwork',
                    type: 'group',
                    password: password,
                    participants: participants,
                    search: [],
                    messages: [],
                    avatar: avatar,
                    send_password: true
                };
                // add search info
                if (last_updated) contact.search.push({tag: 'Online', value: last_updated, privacy: 'Search', row: 1}) ;
                contact.search.push({
                    tag: 'Group',
                    value: contact.participants.length + ' participants',
                    privacy: 'Search',
                    row: contact.search.length+1
                });
                moneyNetworkService.add_contact(contact) ;
                moneyNetworkService.ls_save_contacts(false);
                return contact ;
            } // find_group_chat_contact

            self.start_editing_grp_chat = function () {
                var pgm = controller + 'start_edit_grp_chat: ';
                if (!self.chat_hint_pushpin()) {
                    console.log(pgm + 'pushpin not allowed') ;
                    return ;
                }
                var info;
                if (self.setup.two_panel_chat) info = "Click on avatars to add/remove participants in this group chat" ;
                else info = "Click on avatars to remove participants from this group chat" ;
                if (self.group_chat) {
                    // start, stop, start editing group chat. just continue already group
                    // console.log(pgm + 'start, stop, start editing group chat. just continue already group') ;
                    self.editing_grp_chat = true ;
                    z_wrapper_notification(["info", info , 5000]);
                    return ;
                }
                if (!self.contact.pubkey) {
                    z_wrapper_notification(["error", "Cannot start group chat with this contact. Public key is missing", 5000]);
                    return ;
                }
                z_wrapper_notification(["info", info , 5000]);
                self.group_chat = true ;
                self.editing_grp_chat = true ;
                for (var i=0 ; i<self.contacts.length ; i++) {
                    if (self.contacts[i].unique_id == self.contact.unique_id) {
                        self.group_chat_contacts = [self.contacts[i]] ;
                        return ;
                    }
                }
            }; // start_editing_grp_chat

            self.stop_editing_grp_chat = function () {
                var pgm = controller + '.stop_edit_grp_chat: ' ;
                var contact, path1, path2, a_path, z_path ;
                clear_chat_filter_cache() ;
                if (self.group_chat_contacts.length == 0) {
                    z_wrapper_notification(["error", "Please some participants to chat first", 5000]);
                    return ;
                }
                else if (self.group_chat_contacts.length == 1) {
                    // one and only one contact in chat group. display normal contact info
                    self.editing_grp_chat = false ;
                    self.contact = self.group_chat_contacts[0] ;
                    self.group_chat = false ;
                    self.group_chat_contacts = [] ;
                }
                else {
                    // calc new unique id for this chat group and find/create pseudo group chat contact
                    // do not create pseudo group chat contact yet
                    self.editing_grp_chat = false ;
                    var contact = find_group_chat_contact() ;
                    console.log(pgm + 'contact = ' + JSON.stringify(contact)) ;
                    if (contact && (typeof contact == 'object')) self.contact = contact ;
                    self.show_money = false ;
                }
                contact = self.contact ;

                // update ZeroNet Url
                path1 = self.setup.two_panel_chat ? '/chat2' : '/chat' ;
                if (!contact) path2 = '' ;
                else if ((contact.type == 'group') || (moneyNetworkService.is_old_contact(contact, true))) path2 = '/' + contact.unique_id ;
                else path2 = '/' + contact.cert_user_id ;
                a_path = path1 + path2 ;
                z_path = "?path=" + a_path ;
                ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Chat", z_path]) ;
            }; // stop_editing_grp_chat

            self.grp_chat_add = function (contact) {
                var pgm = controller + '.grp_chat_add: ' ;
                if (!self.editing_grp_chat) {
                    // not editing chat grp. simple redirect
                    self.chat_contact(contact) ;
                    return ;
                }
                if (contact.type == 'group') return ; // todo: allow adding a old chat group to new chat group?
                // is contact already in self.group_chat_contacts array?
                var index = -1 ;
                for (var i=0 ; i<self.group_chat_contacts.length ; i++) {
                    if (self.group_chat_contacts[i].unique_id == contact.unique_id) index = i ;
                }
                if (index == -1) {
                    // console.log(pgm + 'adding contact with hashkey ' + contact["$$hashKey"] + ' to this group chat') ;
                    if (!contact.pubkey) {
                        z_wrapper_notification(["error", "Cannot add this contact to group chat. Public key is missing", 5000]);
                        return ;
                    }
                    self.group_chat_contacts.push(contact) ;
                }
                else {
                    // console.log(pgm + 'removing contact with hashkey ' + contact["$$hashKey"] + ' from this group chat') ;
                    self.group_chat_contacts.splice(index,1) ;
                    if (!self.setup.two_panel_chat && (self.group_chat_contacts.length == 0)) {
                        // one panel chat and participant has been removed
                        self.see_all_chat() ;
                    }
                }
                // console.log(pgm + 'self.group_chat_contacts = ' + JSON.stringify(self.group_chat_contacts)) ;
            }; // grp_chat_add

            // chat group participants - aquamarine background color for selected participants.
            self.contact_background_color = function (contact) {
                var pgm = controller + '.background_color: ' ;
                var style ;
                if (!self.editing_grp_chat) return {} ;
                var index = -1 ;
                for (var i=0 ; i<self.group_chat_contacts.length ; i++) {
                    if (self.group_chat_contacts[i].unique_id == contact.unique_id) index = i ;
                }
                if (index == -1) return {} ;
                else return {'background-color':'aquamarine'};
            }; // contact_background_color

            // get contacts. two different types of contacts:
            // a) contacts stored in localStorage
            self.contacts = moneyNetworkService.get_contacts() ; // array with contacts from localStorage
            // b) search for new ZeroNet contacts using user info (Search and Hidden keywords)
            var loading_contact = $routeParams.unique_id ;
            self.zeronet_search_contacts = function() {
                moneyNetworkService.z_contact_search(function () {
                    if ($routeParams.unique_id) find_contact();
                    $scope.$apply();
                }, null, null) ;
            };
            self.zeronet_search_contacts() ;

            self.contact = null;
            self.messages = moneyNetworkService.js_get_messages();
            // console.log(controller + ': messages = ' + JSON.stringify(self.messages));

            // disabled chat. contact without public key. span with explanation about deleting old inactive accounts
            self.no_days_before_cleanup = moneyNetworkService.get_no_days_before_cleanup() ;

            // find contact. relevant if chat is called from contact page or when using deep link to start chat
            function find_contact() {
                var pgm = controller + '.find_contact: ';
                var unique_id, i, contact, online, last_online, last_contact, a_path, z_path ;
                unique_id = $routeParams.unique_id;
                if (unique_id === undefined) return ;
                if (!unique_id) return ;
                if (unique_id.match(/^[0-9a-f]{64}$/)) {
                    // valid unique id
                    // console.log(pgm + 'unique_id is a valid sha256 address');
                    for (i = 0; i < self.contacts.length; i++) {
                        if (self.contacts[i].unique_id == unique_id) {
                            self.contact = self.contacts[i];
                            if (!self.contact.messages) self.contact.messages = [];
                            // console.log(pgm + 'contact = ' + JSON.stringify(self.contact));
                            if (self.contact.type == 'group') init_group_chat_contacts(self.contact) ;
                            else {
                                moneyNetworkService.is_old_contact(self.contact);
                                self.group_chat = false ;
                                self.group_chat_contacts.splice(0,self.group_chat_contacts.length) ;
                            }
                            self.contact.seen_at = new Date().getTime() ;
                            moneyNetworkService.update_chat_notifications() ;
                            moneyNetworkService.ls_save_contacts(false) ;
                            // console.log(pgm + 'self.group_chat = ' + self.group_chat) ;
                            // console.log(pgm + 'self.contact = ' + (self.contact ? true : false)) ;
                            loading_contact = false ;
                            clear_chat_filter_cache() ;
                            return
                        }
                    }
                    console.log(pgm + 'contact with unique id ' + unique_id + ' was not found');
                    loading_contact = false ;
                    // remove invalid deep link from z_url
                    a_path = self.setup.two_panel_chat ? '/chat2' : '/chat' ;
                    z_path = "?path=" + a_path ;
                    ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Chat", z_path]) ;
                    return ;
                }
                else if ((unique_id.indexOf('@') != -1) && (unique_id != ZeroFrame.site_info.cert_user_id)) {
                    // check if unique_id is a known cert_user_id
                    // console.log(pgm + 'check if unique_id is a known cert_user_id') ;
                    for (i=0 ; i<self.contacts.length ; i++) {
                        if (self.contacts[i].type == 'group') continue ;
                        if (self.contacts[i].cert_user_id == unique_id) {
                            contact = self.contacts[i] ;
                            online =  MoneyNetworkHelper.get_last_online(contact) ;
                            if (!last_online || (online > last_online)) {
                                last_contact = contact ;
                                last_online = online ;
                            }
                        }
                    }
                    if (last_contact) {
                        self.contact = last_contact ;
                        if (!self.contact.messages) self.contact.messages = [];
                        self.group_chat = false ;
                        self.group_chat_contacts.splice(0,self.group_chat_contacts.length) ;
                        self.contact.seen_at = new Date().getTime() ;
                        moneyNetworkService.update_chat_notifications() ;
                        moneyNetworkService.ls_save_contacts(false) ;
                        loading_contact = false ;
                        clear_chat_filter_cache() ;
                        return ;
                    }
                    console.log(pgm + 'contact with cert_user_id ' + unique_id + ' was not found');
                    loading_contact = false ;
                    // remove invalid deep link from z_url
                    a_path = self.setup.two_panel_chat ? '/chat2' : '/chat' ;
                    z_path = "?path=" + a_path ;
                    ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Chat", z_path]) ;
                    return ;
                }
                // remove invalid deep link from z_url
                a_path = self.setup.two_panel_chat ? '/chat2' : '/chat' ;
                z_path = "?path=" + a_path ;
                ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Chat", z_path]) ;
                console.log(pgm + 'contact with id ' + unique_id + ' was not found');
            } // find_contact

            function init_group_chat_contacts (contact) {
                var pgm = controller + '.init_group_chat_contacts: ' ;
                // this function should only be used for group contacts
                if (contact.type != 'group') {
                    console.log(pgm + 'not a pseudo chat contact') ;
                    return ;
                }
                // initialize group_chat
                var i, unique_id, index, j, my_unique_id, participant ;
                // console.log(controller + ': initialise group chat from group chat pseudo contact');
                my_unique_id = moneyNetworkService.get_my_unique_id() ;
                self.group_chat_contacts.splice(0, self.group_chat_contacts.length) ;
                for (i=0 ; i<self.contact.participants.length ; i++) {
                    unique_id = self.contact.participants[i] ;
                    if (unique_id == my_unique_id) continue ;
                    participant = moneyNetworkService.get_contact_by_unique_id(unique_id) ;
                    if (participant) self.group_chat_contacts.push(participant) ;
                    else console.log(controller + ': contact with unique id ' + unique_id + ' was not found') ;
                } // for i
                self.group_chat = true ;
                // console.log(controller + ': initialize group_chat_contacts. self.group_chat_contacts = ' + JSON.stringify(self.group_chat_contacts)) ;
            }

            if (self.contact) {
                (function () {
                    if (self.contact.type == 'group') init_group_chat_contacts(self.contact) ;
                    var focus_new_chat_msg = function() {
                        document.getElementById('new_chat_msg').focus() ;
                    };
                    $timeout(focus_new_chat_msg);

                })() ;
            }

            self.avatar = moneyNetworkService.get_avatar();

            // quick instructions for newcomers
            self.show_welcome_msg1 = function () { // any contacts?
                if (!self.contacts) return true ;
                return (self.contacts.length == 0) ;
            }; // show_welcome_msg1
            self.show_welcome_msg2 = function () { // any messages?
                if (self.show_welcome_msg1()) return false ;
                if (self.contact) return false ;
                for (var i=0 ; i<self.contacts.length ; i++) {
                    if (self.contacts[i].messages && self.contacts[i].messages.length) return false ;
                }
                return true ;
            }; // show_welcome_msg2
            self.show_no_welcome = function() { // no special messages
                if (self.show_welcome_msg1()) return false ;
                if (self.show_welcome_msg2()) return false ;
                return true ;
            };

            // hints to guide user to next step in chat process + show/hide pushpin, ok and remove glyphicon
            function chat_hint_account_page () {
                return (!self.contacts || (self.contacts.length == 0))
            }
            function chat_hint_network_page () {
                return (!self.setup.two_panel_chat && !self.contact && (self.messages.length == 0))
            }
            self.chat_hint_start_chat = function () {
                return (!self.contact && !self.group_chat)
            };
            self.chat_hint_chatting = function () {
                if (chat_hint_account_page() || chat_hint_network_page() || self.chat_hint_start_chat()) return false ;
                else return true ;
            };
            self.chat_hint_send = function () {
                if (!self.chat_hint_chatting()) return false ;
                // send chat message?
                return ((self.contact && self.contact.pubkey && !self.group_chat) ||
                        (self.group_chat && (self.group_chat_contacts.length > 0))) ;

            };
            self.chat_hint_pubkey = function () {
                var pgm = controller + '.chat_hint_pubkey: ' ;
                var hint_pubkey, contact ;
                if (!self.chat_hint_chatting()) return false ;
                // missing public key for contact?
                hint_pubkey = (self.contact && (self.contact.type != 'group') && ((!self.contact.pubkey || ('' + self.contact.encryption == '2') && !self.contact.pubkey2))) ;
                if (hint_pubkey) {
                    contact = JSON.parse(JSON.stringify(self.contact)) ;
                    delete contact.messages ;
                    console.log(pgm + 'deleted contact? contact = ' + JSON.stringify(contact)) ;
                    //contact = {
                    //    "unique_id": "8d07e1d69db580cb7169f752bddff989129a47338d626685c32dad0633a35180",
                    //    "type": "new",
                    //    "guest": null,
                    //    "auth_address": "16SNxdSpUYVLdVQWx6azQjoZXsZJHJUzKN",
                    //    "cert_user_id": "jrotest8@zeroid.bit",
                    //    "avatar": "2.png",
                    //    "search": [{
                    //        "tag": "Online",
                    //        "value": null,
                    //        "privacy": "Search",
                    //        "debug_info": {},
                    //        "row": 1,
                    //        "$$hashKey": "object:702"
                    //    }, {
                    //        "tag": "%",
                    //        "value": "%",
                    //        "privacy": "Search",
                    //        "row": 2,
                    //        "$$hashKey": "object:703"
                    //    },
                    //    ... total 15 identical rows
                    //
                    //    ,  {
                    //        "tag": "Online",
                    //        "value": null,
                    //        "privacy": "Search",
                    //        "row": 15,
                    //        "$$hashKey": "object:716"
                    //    }, {"tag": "Online", "value": null, "privacy": "Search", "row": 16, "$$hashKey": "object:988"}],
                    //    "outbox_sender_sha256": {},
                    //    "inbox_zeronet_msg_id": [],
                    //    "inbox_last_sender_sha256": null,
                    //    "inbox_last_sender_sha256_at": 0,
                    //    "seen_at": 1486615160022,
                    //    "notifications": 0,
                    //    "$$hashKey": "object:125",
                    //    "user_seq": null,
                    //    "pubkey": null,
                    //    "pubkey2": "ApTPzNsPcN8XO3cRBwasO5MoX3D5UmYjAAYkIwVqVsvV",
                    //    "encryption": "1"
                    //};
                }
                return hint_pubkey ;
            };
            self.chat_hint_pushpin = function () {
                if (self.editing_grp_chat) return false ;
                if (self.setup.two_panel_chat) return (!self.chat_hint_pubkey()) ;
                else return (self.group_chat_contacts.length > 1) ;
            } ;
            self.chat_hint = function () {
                // start up hints - user is not chatting
                if (!ZeroFrame.site_info) return 'Please wait. ZeroFrame is loading' ;
                if (chat_hint_account_page()) return 'No contacts were found. Please go to "Account" page and enter/update search tags.' ;
                if (chat_hint_network_page()) return 'Click on "Network page" or enable "Two panel chat" to see contacts' ;
                if (!ZeroFrame.site_info.cert_user_id) return 'No ZeroNet certificate. Select certificate to chat' ;
                if (!moneyNetworkService.get_user_id()) return 'Not logged in. Cannot chat. Click ' +  shortCertId(ZeroFrame.site_info.cert_user_id) + ' in menu to log in' ;
                if (self.chat_hint_start_chat()) return 'Click on an avatar to start PRIVATE CHAT';

                // user is chatting - concatenate hints
                var send, pubkey, avatar, pushpin, ok, x  ;
                if (self.chat_hint_send()) send = true ;
                if (self.chat_hint_pubkey()) pubkey = true ;
                if (self.editing_grp_chat) avatar = true ;
                if (self.chat_hint_pushpin()) pushpin = true ;
                if (self.editing_grp_chat && (self.group_chat_contacts.length > 0)) ok = true ;
                x = true ;

                var msg = [] ;
                if (send) msg.push('Send message') ;
                if (pubkey) msg.push('Cannot chat with this contact. Public key was not found');
                if (self.group_chat && (self.group_chat_contacts.length == 0)) msg.push('Empty chat group');
                if (avatar) {
                    if (self.setup.two_panel_chat) msg.push('Click on avatars to update participants') ;
                    else msg.push('Click on avatars to remove participants') ;
                }
                if (pushpin) {
                    if (self.setup.two_panel_chat) msg.push('Click pushpin to update participants');
                    else msg.push('Click pushpin to remove participants');
                }
                if (ok) msg.push('Click OK when done');
                if (x) msg.push('X = all messages') ;
                return msg.join(' / ') ;
            };

            // edit contact.alias functions
            // todo: almost identical code in NetworkCtrl. Refactor to MoneyNetworkService
            self.edit_alias_title = "Edit alias. Press ENTER to save. Press ESC to cancel" ;
            var edit_alias_notifications = 1 ;
            self.edit_alias = function (contact) {
                var pgm = controller + '.edit_alias: ', i, id ;
                debug('edit_alias', pgm + 'contact = ' + JSON.stringify(contact));
                if (contact) {
                    // left panel (network) edit contact alias
                    id = contact["$$hashKey"] + ":alias"
                }
                else {
                    // right panel (chat) edit contact alias
                    id = 'contact_alias_id';
                    contact = self.contact ;
                }
                contact.new_alias = moneyNetworkService.get_contact_name(contact);
                contact.edit_alias = true ;
                if (edit_alias_notifications > 0) {
                    z_wrapper_notification(["info", self.edit_alias_title, 5000]);
                    edit_alias_notifications-- ;
                }
                // set focus - in a timeout - wait for angularJS
                var set_focus = function () { document.getElementById(id).focus() } ;
                $timeout(set_focus) ;
            } ; // edit_alias
            self.cancel_edit_alias = function (contact) {
                var pgm = controller + '.cancel_edit_alias: ' ;
                debug('edit_alias', pgm + 'contact = ' + JSON.stringify(contact));
                if (!contact) contact = self.contact ; // right panel
                delete contact.new_alias ;
                delete contact.edit_alias ;
                $scope.$apply() ;
            } ; // cancel_edit_alias
            self.save_user_info = function (contact) {
                var pgm = controller + '.save_user_info: ';
                debug('edit_alias', pgm + 'contact = ' + JSON.stringify(contact));
                if (!contact) contact = self.contact ; // right panel
                // update angular UI
                contact.alias = contact.new_alias ;
                delete contact.new_alias ;
                delete contact.edit_alias ;
                $scope.$apply() ;
                // save contacts in localStorage
                // console.log(pgm + 'calling ls_save_contacts') ;
                moneyNetworkService.ls_save_contacts(false) ;
            }; // save_user_info


            // filter contacts in chat. show chat from contacts with green filter. hide chat from contacts with red filter
            // saved in localStorage.setup.contact_filters (per user)
            // todo: refactor: same functions are used in network controller
            self.toggle_filter = function (filter, spam) {
                var pgm = controller + '.toggle_filter: ' ;
                clear_chat_filter_cache(spam) ;
                if (self.setup.contact_filters[filter] == 'green') self.setup.contact_filters[filter] = 'red' ;
                else self.setup.contact_filters[filter] = 'green' ;
                // special action for all
                if (filter == 'all') {
                    if (self.setup.contact_filters['all'] == 'green') {
                        // all: red => green. set all filters to green
                        for (filter in self.setup.contact_filters) self.setup.contact_filters[filter] = 'green' ;
                    }
                    else {
                        // all: green => red. set all filters to red if all filters are green
                        if (self.setup.contact_filters.new == 'red') return ;
                        if (self.setup.contact_filters.unverified == 'red') return ;
                        if (self.setup.contact_filters.verified == 'red') return ;
                        if (self.setup.contact_filters.ignore == 'red') return ;
                        for (filter in self.setup.contact_filters) self.setup.contact_filters[filter] = 'red' ;
                    }
                }
                else if ((self.setup.contact_filters[filter] == 'red') && (self.setup.contact_filters.all == 'green')) self.setup.contact_filters.all = 'red' ;
                moneyNetworkService.save_user_setup() ;
            };

            self.contact_add = function () {
                clear_chat_filter_cache() ;
                moneyNetworkService.contact_add(self.contact);
            };
            self.contact_ignore = function () {
                clear_chat_filter_cache() ;
                moneyNetworkService.contact_ignore(self.contact);
            }; // unignore new contact
            self.contact_unplonk = function () {
                clear_chat_filter_cache() ;
                moneyNetworkService.contact_unplonk(self.contact);
            };
            self.contact_verify = function () {
                clear_chat_filter_cache() ;
                moneyNetworkService.contact_verify(self.contact);
            };

            self.show_contact_delete = function() {
                var pgm = controller + '.show_contact_delete: ' ;
                if (!self.contact) return false ;
                var no_msg = 0, i, message ;
                for (i=0 ; i<self.contact.messages.length ; i++) {
                    message = self.contact.messages[i];
                    if (!message.deleted_at) no_msg++ ;
                } // for i
                if (no_msg > 0) return true ;
                if (!self.contact.pubkey) return true ;
                if (self.contact.outbox_sender_sha256) return true ;
                return false ;
            };
            self.contact_delete = function () {
                var pgm = controller + '.contact_delete: ' ;
                moneyNetworkService.contact_delete(self.contact, function () {
                    // contact deleted. show chat for all contacts
                    clear_chat_filter_cache() ;
                    self.contact = null ;
                }) ;
            };

            self.show_contact_mute_add = function () {
                if (!self.contact) return false ;
                if (self.contact.type == 'group') return false ;
                return !self.contact.muted_at ;
            };
            self.contact_mute_add = function () {
                moneyNetworkService.contact_mute_add(self.contact);
            };
            self.show_contact_mute_remove = function () {
                if (!self.contact) return false ;
                if (self.contact.type == 'group') return false ;
                return self.contact.muted_at ;
            };
            self.contact_mute_remove = function () {
                moneyNetworkService.contact_mute_remove(self.contact);
            };

            self.show_group_delete = function () {
                if (self.editing_grp_chat) return false ;
                return true ;
            };
            self.group_delete = function () {
                var pgm = controller + '.group_delete: ';
                moneyNetworkService.contact_delete(self.contact, function () {
                    // group contact deleted. show chat for all contacts
                    clear_chat_filter_cache() ;
                    self.contact = null ;
                    self.group_chat = false ;
                }) ;
            };

            self.show_edit_icon = function (message) {
                return ((message.message.folder == 'outbox') && (message.message.message.msgtype == 'chat msg'))
            };
            self.show_remove_icon = function (message) {
                return !self.show_edit_icon(message) ;
            };
            self.show_bullhorn_icon = function (message) {
                // bullhorn = spam. only ingoing public chat
                if (message.message.folder != 'inbox') return false ;
                if (!message.message.z_filename) return false ;
                if (message.contact.type == 'ignore') return false ;
                return true ;
            };
            self.show_verify_icon = function (message) {
                if (message.message.folder != 'inbox') return false ;
                if (message.message.message.msgtype != 'verify') return false ;
                if (!message.message.message.password_sha256) return false ;
                return true ;
            };
            self.show_image = function (message) {
                var pgm = controller + '.show_image: ' ;
                var show ;
                if (message.message.message.msgtype != 'chat msg') show=false ;
                else if (message.message.message.hasOwnProperty('image')) show=true ; // image (base64), true or false
                else show=false ;
                // console.log(pgm + 'messsage = ' + JSON.stringify(message.message.message).substr(0,100) + ', show = ' + show);
                return show ;
            };
            self.get_image_src = function (message) {
                var pgm = controller + '.show_image: ' ;
                var src ;
                if (!self.show_image(message)) return null ;
                if (typeof message.message.message.image == 'string') src = message.message.message.image ;
                else if (message.message.message.image) src = 'public/images/image_loading.gif' ;
                else src = 'public/images/image_failed.gif' ;
                // console.log(pgm + 'messsage = ' + JSON.stringify(message.message.message).substr(0,100) + ', show = ' + show);
                return src ;
            };
            self.enter_password = function (message) {
                ZeroFrame.cmd("wrapperPrompt", ["Enter verification password:", "text"], function (password) {
                    var pgm = controller + '.enter_password: ';
                    console.log(pgm + 'message.message = ' + JSON.stringify(message.message));
                    console.log(pgm + 'password = ' + password) ;
                    var expected_sha256 = message.message.message.password_sha256 ;
                    var found_sha256 = CryptoJS.SHA256(password).toString() ;
                    if (expected_sha256 != found_sha256) {
                        z_wrapper_notification(["error", 'Invalid verification password. Try again', 3000]);
                        self.enter_password(message);
                        return ;
                    }
                    console.log(pgm + 'password is correct');
                    var verified_message = { msgtype: 'verified', password: password } ;
                    // validate json
                    var error = MoneyNetworkHelper.validate_json (pgm, verified_message, verified_message.msgtype, 'Password was correct but verification response was not sent to contact') ;
                    if (error) {
                        moneyNetworkService.ls_save_contacts(false);
                        z_wrapper_notification(["Error", error]);
                        return ;
                    }
                    // send message
                    moneyNetworkService.add_msg(message.contact, verified_message) ;
                    moneyNetworkService.ls_save_contacts(true) ;
                    // notification
                    delete message.message.message.password_sha256 ;
                    z_wrapper_notification(["info", "Verification OK", 3000]);
                });
            }; // enter_password
            self.contact_remove = function () {
                clear_chat_filter_cache() ;
                moneyNetworkService.contact_remove(self.contact);
            };

            // admin functions. should only be used for deleting test user accounts
            self.show_delete_user1 = moneyNetworkService.is_admin() ;
            self.delete_user1 = function () {
                var pgm = controller + '.delete_user1: ' ;
                var contact, user_path, inner_path ;
                if (!self.contact || (self.contact.type == 'group')) return ;
                contact = self.contact ;

                // any files to delete? check content.json file
                user_path = "data/users/" + contact.auth_address;
                inner_path = user_path + '/content.json' ;
                moneyNetworkService.z_file_get(pgm, {inner_path: inner_path, required: false}, function (content) {
                    var pgm = controller + '.delete_user1 z_file_get callback 1: ' ;
                    var error, files, file_names, total_size, file_name, file_texts, text, files_optional,
                        file_names_lng1, file_names_lng2, last_online, modified, dif ;
                    if (!content) {
                        error = 'system error. content.json file was not found for auth_address ' + contact.auth_address ;
                        console.log(pgm + error) ;
                        z_wrapper_notification(["error", error, 5000]);
                        return ;
                    }
                    try {
                        content = JSON.parse(content) ;
                    }
                    catch (e) {
                        error = 'system error. invalid content.json file for auth_address ' + contact.auth_address ;
                        console.log(pgm + error) ;
                        z_wrapper_notification(["error", error, 5000]);
                        return ;
                    }
                    files = content.files ;
                    file_names = [] ;
                    file_texts = [] ;
                    total_size = 0 ;
                    for (file_name in files) {
                        file_names.push(file_name) ;
                        file_texts.push(file_name) ;
                        total_size += files[file_name].size ;
                    }
                    file_names_lng1 = file_names.length ;
                    files_optional = content.files_optional ;
                    if (files_optional) {
                        for (file_name in files_optional) {
                            file_names.push(file_name) ;
                            total_size += files_optional[file_name].size ;
                        }
                        file_names_lng2 = file_names.length ;
                        if (file_names_lng2 - file_names_lng1 == 1) file_texts.push('1 optional file.') ;
                        else if (file_names_lng2 - file_names_lng1 > 1) file_texts.push((file_names_lng2 - file_names_lng1) + ' optional files.') ;
                    }
                    if (file_names.length == 0) {
                        z_wrapper_notification(["info", "User has already been deleted. No files were found", 5000]);
                        return ;
                    }

                    // check last online timestamp. Maybe user has selected "Show as offline" in Account setup
                    last_online = moneyNetworkService.get_last_online (contact) ;
                    modified = content.modified ; // unix timestamp
                    dif = Math.abs(last_online - modified) ;
                    // console.log(pgm + 'dif = ' + dif + ', content.modified = ' + modified + ', last_online = ' + last_online) ;

                    // admin dialog
                    text = "Delete user with auth_address " + contact.auth_address + "?<br>" ;
                    if (dif > 60) text += 'Maybe "show as offline" user. Last online ' + date(modified*1000, 'short') + '<br>' ;
                    text += "This function should only be used for test accounts!<br>" ;
                    if (file_texts.size == 1) text += file_texts[0] + ' file.' ;
                    else for (var i=0 ; i<file_texts.length ; i++) {
                        if (i==0) text += '' ;
                        else if (i==file_texts.length-1) text += ' and ' ;
                        else text += ', ' ;
                        text += file_texts[i] ;
                    }
                    text += ' Total ' + total_size + ' bytes' ;
                    moneyNetworkService.confirm_admin_task(text, function (private_key) {
                        var pgm = controller + '.delete_user1 confirm_admin_task callback 2: ' ;
                        var i ;
                        if (!private_key) return ;

                        // delete files
                        console.log(pgm + 'todo: fileDelete and sitePublish must run in a callback chain') ;
                        for (i=0 ; i<file_names.length ; i++) {
                            (function() {
                                var file_name, debug_seq ;
                                file_name = user_path + "/" + file_names[i] ;
                                debug_seq = MoneyNetworkAPILib.f(pgm, file_name, 'fileDelete', MoneyNetworkHelper.show_debug('z_file_delete'));
                                ZeroFrame.cmd("fileDelete", file_name, function (res) {
                                    MoneyNetworkAPILib.debug_z_api_operation_end(debug_seq, res == 'OK' ? 'OK' : 'Failed. error = ' + JSON.stringify(res));
                                });
                            })() ;
                        }

                        // sign and publish. two steps. remove_missing_optional to prevent hanging transactions
                        var file_name = user_path + '/content.json';
                        ZeroFrame.cmd("siteSign", {privatekey: private_key, inner_path: file_name, remove_missing_optional: true}, function (res) {
                            var pgm = controller + '.delete_user1 siteSign callback 3: ' ;
                            var error ;
                            if (res != "ok") {
                                if (res != "ok") {
                                    error = "Failed to publish " + file_name + " : " + res.error;
                                    console.log(pgm + error);
                                    z_wrapper_notification(["error", error, 3000]);
                                    return ;
                                }
                            }

                            ZeroFrame.cmd("sitePublish", {inner_path: file_name, sign: false}, function (res) {
                                var pgm = controller + '.delete_user1 sitePublish callback 4: ' ;
                                var error;
                                if (res != "ok") {
                                    error = "Failed to publish " + file_name + " : " + res.error;
                                    console.log(pgm + error);
                                    z_wrapper_notification(["error", error, 3000]);
                                    return ;
                                }

                                // remove public key. rest of cleanup job can be done with normal delete function
                                delete contact.pubkey ;

                            }); // sitePublish callback 4

                        }) ; // siteSign callback 3

                    }) ; // confirm_admin_task callback 2

                }) ; // z_file_get callback 1

            }; // delete_user1

            // chat page context object shared with moneyNetworkService
            // information used when fetching optional files with public chat relevant for actual page
            self.chat_page_context = moneyNetworkService.get_chat_page_context() ;

            // check public chat after startup and after updates in chat page.
            // called in a $timeout as timestamps for first and last row in chat page are used as filter for public chat messages
            var startup_public_chat_check = true ;
            function check_public_chat () {
                var pgm = controller + '.check_public_chat: ' ;
                var no_msg, i, end_of_page ;
                if (!ZeroFrame.site_info || !self.contacts.length) {
                    // wait for ZeroFrame to finish loading. wait for first contact search to finish
                    $timeout(check_public_chat, 100) ;
                    return ;
                }
                if (!self.setup.public_chat) return ;
                if (startup_public_chat_check && (self.setup.chat_sort != 'Last message')) {
                    // warning. public chat selected and sort is NOT Last message. Any public chat messages will be in bottom of page
                    no_msg = 0 ;
                    for (i=0 ; i<self.messages.length ; i++) if (self.messages[i].chat_filter) no_msg = no_msg + 1 ;
                    end_of_page = (self.chat_page_context.infinite_scroll_limit >= no_msg) ;
                    if (!end_of_page) {
                        z_wrapper_notification(["info", "Public chat is enabled and messages are sorted by " + self.setup.chat_sort +
                            "<br>Scroll down to see public chat", 10000]);
                    }
                }
                startup_public_chat_check = false ;
                debug('infinite_scroll || public_chat', pgm + 'calling moneyNetworkService.check_public_chat');
                moneyNetworkService.check_public_chat() ;
            } // check_public_chat

            // filter and order by used in ng-repeat messages filter
            function clear_chat_filter_cache (spam) {
                var pgm = controller + '.clear_chat_filter_cache: ' ;
                for (var i=0 ; i<self.messages.length ; i++) {
                    delete self.messages[i].chat_filter ;
                    delete self.messages[i].formatted_message ;
                    delete self.messages[i].show_feedback ;
                }
                if (!spam) self.chat_page_context.infinite_scroll_limit = 5 ;
                debug('infinite_scroll || public_chat', pgm + 'calling moneyNetworkService.reset_first_and_last_chat') ;
                moneyNetworkService.reset_first_and_last_chat() ;
                $timeout(check_public_chat, 100) ;
            } // clear_chat_filter_cache
            clear_chat_filter_cache() ;

            // keep track of first and last chat message in chat page
            // must check for public chat messages within actual chat page context when finished loading page
            self.set_first_and_last_chat = function(first,last,message) {
                var pgm = controller + '.set_first_and_last_chat: ' ;
                if (loading_contact) return ; // startup - checking contact in deep link - page not ready
                if (message.child) return ; // not relevant - not top level in message three - must be comment or nested comment in three
                // send chat page context info to service. service will start public chat download if needed
                moneyNetworkService.set_first_and_last_chat(first, last, message, self.contact) ;
            }; // set_first_and_last_chat

            // include parent rows in chat_filter chat (filter by contact only)
            function get_unique_id_for_parents (js_messages_row) {
                var pgm = controller + '.get_unique_id_for_parents: ' ;
                var parent_js_messages_row, unique_ids ;
                if (!js_messages_row.message.message || !js_messages_row.message.message.parent) return [] ; // not a chat msg or no parent chat msg
                // console.log(pgm + 'message.message.message = ' + JSON.stringify(js_messages_row.message.message)) ;
                // console.log(pgm + 'js_messages_row.message.message = ' + JSON.stringify(js_messages_row.message.message)) ;
                // console.log(pgm + 'js_messages_row.contact.unique_id = ' + js_messages_row.contact.unique_id) ;
                parent_js_messages_row = moneyNetworkService.get_message_by_parent(js_messages_row.message.message.parent) ;
                if (!parent_js_messages_row) return [] ; // error. parent was not found
                // console.log(pgm + 'parent_js_messages_row.contact.unique_id = ' + parent_js_messages_row.contact.unique_id) ;
                // recursive call. get unique_ids for grant parent etc
                unique_ids = get_unique_id_for_parents(parent_js_messages_row) ; // get unique_ids for parent rows
                unique_ids.push(parent_js_messages_row.contact.unique_id) ;
                // console.log(pgm + 'unique_ids = ' + JSON.stringify(unique_ids)) ;
                if (self.contact) console.log(pgm + 'self.contact.unique_id = ' + self.contact.unique_id) ;
                return unique_ids ;
            } // get_unique_id_for_parents

            self.chat_filter = function (message, index, messages) {
                var pgm = controller + '.chat_filter: ';
                // check cache
                if (message.hasOwnProperty('chat_filter')) return message.chat_filter ;
                // not in cache
                var match, reason, image, i, unique_id, participant, remote_msg_seq, message2 ;
                image = message.message.message.image? true : false ;
                if (message.message.deleted_at) {
                    // logical deleted message
                    match = false ;
                    reason = 1.1 ;
                }
                else if ((message.message.msgtype == 'chat msg') && !message.message.message.message) {
                    // empty chat message = receive delete chat message
                    match = false ;
                    reason = 1.2 ;
                }
                else if (message.message.message.msgtype == 'received') {
                    // hide image receipts
                    match = false ;
                    reason = 1.3 ;
                }
                else if (message.message.message.msgtype == 'reaction') {
                    // hide private reaction messages
                    match = false ;
                    reason = 1.4 ;
                }
                else if (!self.contact && !self.group_chat) {
                    // no context - show chat for all contacts. Use green/red filter in top of page
                    if (message.contact.type == 'group') {
                        // group chat
                        if (self.setup.contact_filters['all'] == 'green')  {
                            // always show - including empty chat groups
                            reason = 2.1 ;
                            match = true ;
                        }
                        else {
                            reason = 2.2 ;
                            match = false ;
                            // no group filter. check participants in group chat
                            for (i=0 ; i<message.contact.participants.length ; i++) {
                                unique_id = message.contact.participants[i] ;
                                participant = moneyNetworkService.get_contact_by_unique_id(unique_id) ;
                                if (!participant) continue ;
                                if (self.setup.contact_filters[participant.type] == 'green') {
                                    match = true ;
                                    break ;
                                }
                            } // for i (participants)
                        }
                    }
                    else if (message.contact.type == 'public') {
                        // public chat outbox message. always show
                        //if (message.message.folder == 'outbox') {
                        // always show
                        reason = 2.3 ;
                        match = true ;
                        //}
                        //else {
                        //    reason = 2.4 ;
                        //    match = self.setup.public_chat ;
                        //}
                    }
                    else {
                        // private chat or public chat inbox messages
                        match = (self.setup.contact_filters[message.contact.type] == 'green');
                        reason = 2.5 ;
                    }
                }
                else if (self.contact.unique_id == message.contact.unique_id) {
                    // show chat for one contact or one group chat contact
                    match = true ;
                    reason = 3 ;
                }
                else if (get_unique_id_for_parents(message).indexOf(self.contact.unique_id) != -1) {
                    // nested comment. parent matches contact filter
                    match = true ;
                    reason = 3.5 ;
                }
                else if (self.contact.type == 'group') {
                    // group chat contact: show "Started group chat" messages to participants in group chat
                    // console.log(pgm + 'self.contact.password = ' + self.contact.password) ;
                    // console.log(pgm + 'message.message.message.msgtype = ' + message.message.message.msgtype) ;
                    reason = 4.2 ;
                    if (message.message.message.msgtype == 'received') {
                        // receipt for image. Check if image was  in a group chat message
                        remote_msg_seq = message.message.message.remote_msg_seq;
                        for (i = 0; i < messages.length; i++) if (messages[i].message.local_msg_seq == remote_msg_seq) {
                            message2 = messages[i];
                            // debug('chat_filter', pgm + 'remote_msg_seq = ' + remote_msg_seq + ', message2.message = ' + JSON.stringify(message2.message));
                            break;
                        }
                        if (message2) {
                            // image belongs to this group chat?
                            reason = 4.1 ;
                            match = (self.contact.unique_id == message2.contact.unique_id) ;
                        }
                        else {
                            // image must have been deleted
                            reason = 4.2 ;
                            match = false ;
                        }
                    }
                    else if (message.message.message.msgtype == 'group chat') {
                        // group chat started message
                        reason = 4.3 ;
                        match = (message.message.message.password == self.contact.password) ;
                    }
                    else if (message.message.message.msgtype == 'chat msg') {
                        // group chat message. receiver_sha256 = SHA256(group chat password?)
                        // old errors. Messages should have been under 3 instead
                        reason = 4.4 ;
                        match = false ;
                    }
                }
                else {
                    // normal contact: show group chat involving this contact.
                    match = ((message.contact.type == 'group') && (message.contact.participants.indexOf(self.contact.unique_id) != -1)) ;
                    reason = 5 ;
                }

                var message_x ;
                try {
                    message_x = message.message.message.message ? ', message = ' + message.message.message.message.substr(0,40) : '' ;
                }
                catch (err) {
                    message_x = ''
                }
                debug('chat_filter',
                    pgm + 'local_msg_seq = ' + message.message.local_msg_seq + ', folder = ' + message.message.folder +
                    ', match = ' + match + ', reason = ' + reason + ', image = ' + image + ', msgtype = ' + message.message.message.msgtype +
                    message_x);
                // debug('chat_filter', pgm + 'message.message = ' + JSON.stringify(message.message)) ;

                // if ([200, 201, 202].indexOf(message.message.local_msg_seq) != -1) debug('chat_filter', pgm + 'message.message = ' + JSON.stringify(message.message)) ;
                message.chat_filter = match ;
                return match;
            }; // chat_filter

            self.contact_filter = function (contact, index, contacts) {
                var pgm = controller + '.contact_filter: ';
                var i, unique_id, j ;
                if (contact.type == 'group') {
                    if (self.setup.contact_filters['all'] == 'green') return true ;
                    // display group if one participant is within current filter
                    for (i=0 ; i<contact.participants.length ; i++) {
                        unique_id = contact.participants[i] ;
                        for (j=0 ; j<contacts.length ; j++) {
                            if (contacts[j].unique_id == unique_id) {
                                if (self.setup.contact_filters[contacts[j].type] == 'green') return true ;
                                break ;
                            }
                        }
                    }
                    return false ;
                }
                else if (contact.type == 'public') return true ;
                else {
                    // simpel contact filter
                    return (self.setup.contact_filters[contact.type] == 'green');
                }
            }; // contact_filter

            // contacts sort options - typeahead auto complete functionality
            self.contact_sort_options = moneyNetworkService.get_contact_sort_options();
            if (!self.setup.contact_sort) self.setup.contact_sort = self.contact_sort_options[0] ; // not logged in
            self.contact_sort_title = moneyNetworkService.get_contact_sort_title();
            self.contact_sort_changed = function () {
                var pgm = controller + '.sort_changed: ' ;
                moneyNetworkService.save_user_setup();
            };

            self.contact_order_by = function (contact) {
                return moneyNetworkService.contact_order_by(contact);
            }; // contact_order_by

            // chat sort options - typeahead auto complete functionality
            self.chat_sort_options = moneyNetworkService.get_chat_sort_options() ;
            if (!self.setup.chat_sort) self.setup.chat_sort = self.chat_sort_options[0] ; // not logged in
            self.chat_sort_title = moneyNetworkService.get_chat_sort_title() ;
            self.chat_sort_changed = function () {
                var pgm = controller + '.sort_changed: ' ;
                console.log(pgm + 'chat_sort = ' + self.setup.chat_sort) ;
                debug('infinite_scroll || public_chat', pgm + 'calling moneyNetworkService.reset_first_and_last_chat') ;
                moneyNetworkService.reset_first_and_last_chat();
                moneyNetworkService.save_user_setup();
            };
            self.chat_order_by = function (message) {
                return moneyNetworkService.chat_order_by(message) ;
            }; // chat_order_by

            // start chat with contact
            self.chat_contact = function (contact) {
                var pgm = controller + '.chat_contact: ';
                if (self.contact && (self.contact.unique_id == contact.unique_id)) {
                    contact.seen_at = new Date().getTime() ;
                    moneyNetworkService.update_chat_notifications() ;
                    moneyNetworkService.ls_save_contacts(false) ;
                    return ;
                }
                // console.log(pgm + 'contact = ' + JSON.stringify(contact));
                var old_contact, a_path, z_path ;
                clear_chat_filter_cache() ;
                // console.log(pgm + 'contact.unique_id = ' + contact.unique_id);
                // clear any old not sent chat
                self.new_chat_msg = '';
                self.new_chat_src = null ;
                // new contact
                self.contact = contact ;
                if (contact.type == 'group') init_group_chat_contacts(contact) ;
                else {
                    old_contact = moneyNetworkService.is_old_contact(contact);
                    self.group_chat = false ;
                    self.group_chat_contacts.splice(0,self.group_chat_contacts.length) ;
                }
                contact.seen_at = new Date().getTime() ;
                moneyNetworkService.update_chat_notifications() ;
                moneyNetworkService.ls_save_contacts(false) ;
                // update zeronet path - no angularJS redirect
                // console.log(pgm + '$location.path = ' + $location.path()) ;
                a_path = self.setup.two_panel_chat ? '/chat2' : '/chat' ;
                if ((contact.type == 'group') || old_contact) a_path += '/' + contact.unique_id ;
                else a_path += '/' + contact.cert_user_id ;
                z_path = "?path=" + a_path ;
                ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Chat", z_path]) ;
            }; // chat_contact

            self.new_chat_msg = '';
            self.new_chat_src = null ;
            self.new_chat_msg_disabled = false ; // disabled while sending chat message

            self.handleTextAreaHeight = function (e) {
                // see issue #34 Resend old messages?
                if (self.setup.debug && self.setup.debug.disable_autoexpand_textarea) return ;
                var element = e.target;
                element.style.overflow = 'hidden';
                element.style.height = 0;
                element.style.height = element.scrollHeight + 'px';
            };

            // money transaction. open wallet link
            // 1: new chat message. wallet ping timeout or error.
            // 2: old chat message. ping wallet before open window call. wallet may or may not be open
            self.open_wallet = function (money_transaction, linkno) {
                var pgm = controller + '.open_wallet: ' ;
                var unique_text, i, balance, error, url, open_wallet_url ;
                // find wallet url from currency = unique_text
                console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction) + ', linkno = ' + linkno) ;
                if (linkno == 1) {
                    // open wallet link in new chat message (wallet ping timeout or error)
                    unique_text = money_transaction.currency ;
                    for (i=0 ; i<self.currencies.length ; i++) {
                        if (self.currencies[i].unique_text != unique_text) continue ;
                        balance = self.currencies[i] ;
                        break ;
                    }
                    if (!balance) {
                        error = 'error. could not find ' + unique_text + ' wallet' ;
                        console.log(pgm + error) ;
                        z_wrapper_notification(['error', error]) ;
                        return ;
                    }
                    // open wallet
                    url = '/' + (balance.wallet_domain || balance.wallet_address);
                    moneyNetworkService.open_window(pgm, url);
                    return ;
                }
                // linkno = 2. open wallet link in old chat message. ping wallet before open window is called

                // get list of currencies from connected wallets
                open_wallet_url = function() {
                    var url ;
                    url = '/' + money_transaction.wallet_url;
                    moneyNetworkService.open_window(pgm, url);
                } ;
                moneyNetworkService.get_currencies({}, function (currencies, refresh_angular_ui) {
                    var pgm = controller + '.open_wallet get_currencies callback 1: ' ;
                    var sessionid, i, balance ;
                    if (!self.currencies) self.currencies = currencies; // initialize currencies array used in UI
                    if (!currencies || !currencies.length) {
                        console.log(pgm + 'error. no currencies list was found. just open wallet without ping') ;
                        return open_wallet_url() ;
                    }
                    // find sessionid - compare money transaction with currencies. some currency info may have changed since chat msg was sent/received
                    for (i=0 ; i<currencies.length ; i++) {
                        balance = currencies[i] ;
                        if ((money_transaction.wallet_sha256 == balance.wallet_sha256) ||
                            (money_transaction.wallet_url == balance.wallet_domain) ||
                            (money_transaction.wallet_url == balance.wallet_address)) {
                            sessionid = balance.sessionid ;
                            break ;
                        }
                    } // for i
                    console.log(pgm + 'sessionid = ' + sessionid) ;
                    if (!sessionid) {
                        console.log(pgm + 'warning. wallet session was not found. maybe old no longer used wallet. just open wallet') ;
                        return open_wallet_url() ;
                    }
                    MoneyNetworkAPILib.get_session (sessionid, function (session) {
                        var pgm = controller + '.open_wallet get_session callback 2: ' ;
                        var request ;
                        if (!session) {
                            console.log(pgm + 'error. could not find session info for wallet session with sessionid ' + sessionid + ' just open wallet') ;
                            return open_wallet_url() ;
                        }

                        // send ping. timeout max 5 seconds. Expects Timeout or OK response
                        z_wrapper_notification(['info', 'Checking if wallet is already<br>open in an other browser tab', 3000]) ;
                        request = { msgtype: 'ping' };
                        session.encrypt.send_message(request, {response: 5000}, function (response) {
                            var pgm = controller + '.open_wallet send_message callback 3: ' ;
                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // OK. Timeout. Continue with next session
                                console.log(pgm + 'OK wallet ping timeout. open wallet') ;
                                return open_wallet_url();
                            }
                            if (!response || response.error) {
                                // Unexpected error.
                                console.log(pgm + 'error. ping sessionid ' + sessionid + ' returned ' + JSON.stringify(response)) ;
                                return open_wallet_url();
                            }
                            // ping OK. wallet session. notification instead of open window command
                            console.log(pgm + 'wallet session ping OK. notify user. do not open extra wallet session') ;
                            z_wrapper_notification( ['info', 'Wallet is already open in an other browser tab', 5000]) ;

                        }) ; // send_message callback 3

                    }) ; // get_session callback 2

                }) ; // get_currencies callback 1

            } ; // open_wallet

            self.confirmed_send_chat = null ;
            self.send_chat_msg = function () {
                var pgm = controller + '.send_chat_msg: ';
                var i, j, contact, my_unique_id, message, error, money_transactions, wallets_hash, set_ping_error,
                    step_1_confirm_send, step_2_ping_wallets, step_3_check_transactions, step_4_send_message,
                    step_5_send_send_mt ;

                // disable form elements while checking and sending message
                self.new_chat_msg_disabled = true ;

                if (!ZeroFrame.site_info || !ZeroFrame.site_info.cert_user_id || !moneyNetworkService.get_user_id()) {
                    // cannot chat
                    self.new_chat_msg_disabled = false ;
                    return ;
                }

                // check image attachment
                if (self.new_chat_src && !moneyNetworkService.get_image_ext_from_base64uri(self.new_chat_src)) {
                    z_wrapper_notification(["error", "Ups. Something is wrong here.<br>" +
                        "Only png, jpg, jpeg, gif and tif images can be used in chat<br>" +
                        "Sending chat message without image", 5000]);
                    self.new_chat_src='';
                }

                // group chat? find/create pseudo contact for this chat group.
                self.editing_grp_chat = false ;
                if (self.group_chat) {
                    contact = find_group_chat_contact() ;
                    if (!contact) {
                        self.new_chat_msg_disabled = false ;
                        return ;
                    }
                    if (contact.type != 'group') {
                        self.contact = contact ;
                        self.group_chat = false;
                        self.group_chat_contacts = [];
                    }
                }
                if (self.group_chat) {
                    if (contact.send_password) {
                        // new pseudo group chat contact. send password to participants
                        for (i = 0; i < self.group_chat_contacts.length; i++) {
                            message = {
                                msgtype: 'group chat',
                                participants: contact.participants,
                                password: contact.password
                            };
                            debug('outbox && unencrypted', pgm + 'message = ' + JSON.stringify(message));
                            // validate json
                            error = MoneyNetworkHelper.validate_json(pgm, message, message.msgtype, 'Could not send chat message');
                            if (error) {
                                z_wrapper_notification( ["Error", error]);
                                self.new_chat_msg_disabled = false ;
                                return;
                            }
                            // send group chat message
                            moneyNetworkService.add_msg(self.group_chat_contacts[i], message);
                        } // for i
                        delete contact.send_password ;
                    }
                }
                else contact = self.contact ;

                // money transaction?
                if (contact && (contact.type == 'group')) self.show_money = false ;
                if (self.show_money) {
                    if (self.validate_money_transactions()) {
                        // error in money transaction(s)
                        self.new_chat_msg_disabled = false ;
                        return ;
                    }
                    // empty money transaction(s)?
                    money_transactions = false ;
                    for (i=0 ; i<self.money_transactions.length ; i++) {
                        if (!self.money_transaction_is_empty(self.money_transactions[i])) {
                            money_transactions = true ;
                            break ;
                        }
                    }
                    if (!money_transactions) self.show_money = false ;
                }

                // unique_texts hash. money transactions only. used in step_2_ping_wallets and step_3_check_transactions
                wallets_hash = {} ; // new hash. wallet_name => hash with info

                set_ping_error = function (wallet_name, error, show_wallet) {
                    var pgm = controller + '.send_chat_msg.set_ping_error: ';
                    var i, money_transaction, j ;
                    if (!wallets_hash[wallet_name]) throw pgm + 'System error. Unknown wallet name ' + wallet_name ;
                    if (!wallets_hash[wallet_name].money_transactions || !wallets_hash[wallet_name].money_transactions.length) throw pgm + 'System error. No money transactions found for wallet ' + wallet_name ;
                    for (i=0 ; i<wallets_hash[wallet_name].money_transactions.length ; i++) {
                        j = wallets_hash[wallet_name].money_transactions[i] ;
                        money_transaction = self.money_transactions[j] ;
                        if (!money_transaction.message) money_transaction.message = {} ;
                        money_transaction.message.ping = error ;
                        if (show_wallet) money_transaction.message.open_wallet = true ;
                        format_money_transaction_message(money_transaction) ;
                    }
                } ; // set_ping_error

                // create callback chain step 1.. todo: n

                // callback function - optional step - tell wallet session that money transaction(s) has been sent
                step_5_send_send_mt = function() {
                    var pgm = controller + '.send_chat_msg.step_5_send_send_mt: ';
                    var wallet_names, wallet_name, send_mt, countdown_cb ;

                    // one send_mt message for wallet in
                    wallet_names = [] ;
                    for (wallet_name in wallets_hash) wallet_names.push(wallet_name) ;
                    if (!wallet_names.length) return ; // not a money transaction chat msg

                    // loop for each wallet. send money transaction to wallet for validation
                    send_mt = function () {
                        var pgm = controller + '.send_chat_msg.send_chat_msg.step_5_send_send_mt.send_mt: ';
                        var wallet_name, session, money_transactionid, request ;
                        wallet_name = wallet_names.shift() ;
                        if (!wallet_name) return ; // done

                        // build request
                        session = wallets_hash[wallet_name].session ;
                        money_transactionid = wallets_hash[wallet_name].money_transactionid ;
                        request = {
                            msgtype: "send_mt",
                            money_transactionid: money_transactionid
                        } ;
                        countdown_cb = function (countdown) {
                            self.money_transactions_countdown = countdown ;
                            $scope.$apply() ;
                        } ;
                        // send message. wallet session should be ready and running. have just pinged and validated money transaction
                        session.encrypt.send_message(request, {response: 10000, countdown_cb: countdown_cb}, function (response) {
                            var pgm = controller + '.send_chat_msg.send_chat_msg.step_5_send_send_mt.send_mt send_message callback: ';
                            self.money_transactions_countdown = null ;
                            console.log(pgm + 'response = ' + JSON.stringify(response));
                            // response = {"msgtype":"response","error":"message is invalid. Unknown msgtype send_mt"}

                            // todo: fallback to offline transaction after timeout?

                            // next wallet
                            send_mt() ;
                        }) ; // send_message
                    } ; // send_mt
                    send_mt() ;
                }; // step_5_send_send_mt

                // callback function - send chat message
                step_4_send_message = function () {
                    var pgm = controller + '.send_chat_msg.step_4_send_message: ';
                    var i, money_transaction, unique_text, balance, money_transactionid ;
                    // send chat message to contact
                    message = {
                        msgtype: 'chat msg',
                        message: self.new_chat_msg
                    };
                    if (self.new_chat_src) message.image = self.new_chat_src ;
                    if (self.show_money) {

                        console.log(pgm + 'todo: keep money transaction secure and small. chat messages are saved in data.json msg array') ;
                        // todo: save some transaction information in an optional file? For example as offline money transaction in wallet session
                        // todo: allow wallets to communicate direct for faster transaction handshake?
                        // todo: use MoneyNetworkAPI for W2W communication (publish is required)?
                        // todo: use a transaction specific sessionid for W2W communication (public keys + sessionid)?

                        message.money_transactions = [] ;
                        for (i=0 ; i<self.money_transactions.length ; i++) {
                            money_transaction = self.money_transactions[i] ;
                            console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction)) ;
                            unique_text = money_transaction.currency ;
                            balance = moneyNetworkService.get_currency_by_unique_text(unique_text) ;
                            console.log(pgm + 'balance = ' + JSON.stringify(balance)) ;
                            money_transactionid = wallets_hash[balance.wallet_name].money_transactionid ;

                            // todo: amount is a JS number and not a decimal. Number of decimals in UI is not always correct.
                            // see issue https://github.com/jaros1/Money-Network/issues/298
                            // 0.00026220000000000003 in UI. should be 0.00026220. 8 decimals for test bitcoins
                            // an other problem. amount should be displayed in all units. For example bitcoins (8 decimals) and Satoshi (integer)

                            message.money_transactions.push({
                                wallet_url: balance.wallet_domain || balance.wallet_address, // url for open wallet session
                                wallet_sha256: balance.wallet_sha256, // link to full wallet information (wallet.json files)
                                wallet_name: balance.wallet_name, // display info. wallet_title or wallet_address at transaction start time
                                action: money_transaction.action, // Send or Request
                                code: balance.code, // currency code
                                name: balance.name, // display info. currency name at transaction start time
                                amount: (money_transaction.amount * money_transaction.factor).toFixed(money_transaction.decimals), // amount without unit (factor = 1)
                                money_transactionid: money_transactionid,
                                json: money_transaction.json // wallet specific json. any type
                            }) ;
                        } // for i
                    } // if show_money
                    // ready to send. hide any money transactions.
                    self.show_money = false ;

                    MoneyNetworkHelper.debug('outbox && unencrypted', pgm + 'message = ' + JSON.stringify(message));
                    //message = {
                    //    "msgtype": "chat msg",
                    //    "message": "test 6",
                    //    "money_transactions": [{
                    //        "wallet_url": "1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                    //        "wallet_sha256": "e488d78dc26af343688045189a714658ed0f7975d4db158a7c0c5d0a218bfac7",
                    //        "wallet_name": "MoneyNetworkW2",
                    //        "action": "Send",
                    //        "code": "tBTC",
                    //        "name": "Test Bitcoin",
                    //        "amount": 0.0001,
                    //        "json": {"return_address": "2MuDZs8yo375NyNVVQtpNwWuJt1dUVCefLK"}
                    //    }]
                    //};

                    // validate json
                    error = MoneyNetworkHelper.validate_json(pgm, message, message.msgtype, 'Could not send chat message');
                    if (error) {
                        self.new_chat_msg_disabled = false ;
                        console.log(pgm + error) ;
                        z_wrapper_notification( ["Error", error]);
                        return;
                    }

                    //if (message.money_transactions) {
                    //    error = 'Sorry. Money transaction is not yet implemented<br>Todo: receive chat with money transaction' ;
                    //    console.log(pgm + error) ;
                    //    ZeroFrame.cmd("wrapperNotification", ['error', error]) ;
                    //}

                    // console.log(pgm + 'last_sender_sha256 = ' + last_sender_sha256);
                    // send message
                    moneyNetworkService.add_msg(contact, message);
                    if (self.group_chat && self.new_chat_src) {
                        // sending a group chat message with an image.
                        // expects one receipt for each participant in chat group except me
                        // remove image chat message from zeronet (data.json) when all image receipts have been received
                        // see process_incoming_message - post processing of image receipts
                        // see z_update_data_json - data.json too big - xxxxxx
                        my_unique_id = moneyNetworkService.get_my_unique_id() ;
                        var message_with_envelope = contact.messages[contact.messages.length-1] ;
                        message_with_envelope.image_receipts = [] ;
                        for (i=0 ; i<contact.participants.length ; i++) {
                            if (contact.participants[i] == my_unique_id) continue ;
                            message_with_envelope.image_receipts.push(contact.participants[i]) ;
                        }
                        debug('outbox && unencrypted', pgm + 'message_with_envelope = ' + JSON.stringify(message_with_envelope)) ;
                    }

                    // ready for next chat msg
                    self.new_chat_msg = '';
                    self.new_chat_src = null ;
                    self.new_chat_msg_disabled = false ;
                    // console.log(pgm + 'contact = ' + JSON.stringify(contact));
                    // update localStorage and ZeroNet
                    // console.log(pgm + 'calling ls_save_contacts');
                    if (contact) contact.seen_at = new Date().getTime() ;
                    moneyNetworkService.update_chat_notifications() ;
                    moneyNetworkService.ls_save_contacts(true);

                    // tell wallet(s) that chat message with money transactions has been sent to receiver
                    // wallet must prepare for encrypted wallet to wallet communication
                    if (message.money_transactions) step_5_send_send_mt() ;
                } ; // step_4_send_message

                // callback function - optional step - money transactions - check money transactions
                step_3_check_transactions = function() {
                    var pgm = controller + '.send_chat_msg.step_3_check_transactions: ';
                    var wallet_name, wallet_names, check_transaction ;
                    if (!self.show_money) return step_4_send_message() ; // no money - continue with next step

                    self.new_chat_msg_disabled = 'Validating money transaction' + (self.money_transactions.length > 1 ? 's' : '') + ' ...';
                    $rootScope.$apply() ;

                    // check money transactions for each unique_text (wallet)
                    wallet_names = [] ;
                    for (wallet_name in wallets_hash) wallet_names.push(wallet_name) ;

                    // loop for each wallet. send money transaction to wallet for validation
                    check_transaction = function () {
                        var pgm = controller + '.send_chat_msg.step_3_check_transactions.check_transaction: ';
                        var wallet_name, session, request, i, j, money_transaction, factor, decimals, units, errors, error,
                            money_transactionid, unique_text, balance, timeout_msg, countdown_cb ;
                        wallet_name = wallet_names.shift() ;
                        if (!wallet_name) {
                            // todo: done checking money transactions. count errors. notification, stop or continue
                            // done pinging wallet sessions. count number of ping errors
                            errors = 0 ;
                            for (i=0 ; i<self.money_transactions.length ; i++) {
                                money_transaction = self.money_transactions[i] ;
                                if (money_transaction.message && money_transaction.message.ping) errors++ ;
                            }
                            if (errors) {
                                // one or more wallet ping errors. stop end chat message
                                self.new_chat_msg_disabled = false ;
                                $rootScope.$apply() ;
                                error =
                                    'Sorry. Wallet validate error' + (errors > 1 ? 's' : '') + '.' +
                                    '<br>See red error message' + (errors > 1 ? 's' : '') + ' in chat.' ;
                                console.log(pgm + error) ;
                                console.log(pgm + 'self.new_chat_msg_disabled = ' + self.new_chat_msg_disabled);
                                z_wrapper_notification(['error', error]) ;
                                return ;
                            }

                            self.new_chat_msg_disabled = false ;
                            $rootScope.$apply() ;
                            step_4_send_message() ;
                            return ;
                        }

                        // generate transaction id. one transactionid for each wallet. used in the same way as sessionid in MoneyNetworkAPI (session filenames, symmetric encryption)
                        // each row in money transactions array has transactionid-<line number>
                        money_transactionid = MoneyNetworkHelper.generate_random_password(60, true) ;
                        wallets_hash[wallet_name].money_transactionid = money_transactionid ;

                        // get session
                        session = wallets_hash[wallet_name].session ;
                        // build validate money transactions request
                        // contact. receiver of chat message / money transaction. auth_address is unique user id. cert_user_id and alias are human text fields and are not unique / secure

                        request = {
                            msgtype: 'prepare_mt_request',
                            contact: {
                                alias: moneyNetworkService.get_contact_name(contact),
                                cert_user_id: contact.cert_user_id,
                                auth_address: contact.auth_address
                            },
                            open_wallet: true,
                            money_transactions: [],
                            money_transactionid: money_transactionid
                        } ;
                        for (i=0 ; i<wallets_hash[wallet_name].money_transactions.length ; i++) {
                            j = wallets_hash[wallet_name].money_transactions[i] ;
                            money_transaction = self.money_transactions[j] ;
                            unique_text = money_transaction.currency ;
                            balance = moneyNetworkService.get_currency_by_unique_text(unique_text) ;

                            // find conversion factor from units definition
                            delete money_transaction.factor ;
                            units = balance.units ;
                            factor = null ;
                            for (j=0 ; j<units.length ; j++) if (units[j].unit == money_transaction.unit) {
                                if ((factor != null) && (factor != units[j].factor)) {
                                    // doublet unit definition with different conversion factors!
                                    console.log(pgm + 'System error in units definition. units = ' + JSON.stringify(units)) ;
                                    set_ping_error(wallet_name, 'Could not find conversion factor for ' + money_transaction.unit, false) ;
                                    return check_transaction() ;
                                }
                                factor = units[j].factor ;
                            }
                            decimals = null ;
                            for (j=0 ; j<units.length ; j++) if (units[j].factor == 1) {
                                if ((decimals != null) && (decimals != units[j].decimals)) {
                                    // doublet unit definition with different conversion factors!
                                    console.log(pgm + 'System error in units definition. units = ' + JSON.stringify(units)) ;
                                    set_ping_error(wallet_name, 'Could not number for decimal for unit with factor 1', false) ;
                                    return check_transaction() ;
                                }
                                decimals = units[j].decimals ;
                            }
                            if (decimals == null) {
                                console.log(pgm + 'System error in units definition. units = ' + JSON.stringify(units)) ;
                                set_ping_error(wallet_name, 'Could not number for decimal for unit with factor 1', false) ;
                                return check_transaction() ;
                            }

                            money_transaction.factor = factor ;
                            money_transaction.decimals = decimals ;
                            console.log(pgm + 'factor = ' + factor + ', decimals = ' + decimals) ;
                            // factor = 1e-8, decimals = 8

                            // convert amount to base unit (factor 1) before sending request to wallet
                            // todo: should send amount as text. number with 8 decimals
                            request.money_transactions.push({
                                action: money_transaction.action,
                                code: balance.code,
                                amount: (money_transaction.amount * factor).toFixed(decimals)
                            }) ;
                        } // for i
                        console.log(pgm + 'request = ' + JSON.stringify(request)) ;
                        //request = {
                        //    "msgtype": "prepare_mt_request",
                        //    "money_transactions": [{
                        //        "action": "Send",
                        //        "code": "tBTC",
                        //        "amount": "0.00001"
                        //    }]
                        //};
                        if (request.money_transactions.length != wallets_hash[wallet_name].money_transactions.length) {
                            error = 'Error. Expected ' + wallets_hash[wallet_name].money_transactions.length + ' money transactions in request. found ' + request.money_transactions.length;
                            console.log(pgm + error) ;
                            set_ping_error(wallet_name, error, false) ;
                            return check_transaction() ;
                        }
                        timeout_msg = ['info', 'Issue with validate money transaction timeout may have been solved<br>Please try again (Send chat message)', 10000] ;
                        countdown_cb = function (countdown) {
                            self.money_transactions_countdown = countdown ;
                            $scope.$apply() ;
                        } ;

                        // send validate money transactions request to wallet (wait max 60 seconds. wallet may call external API in validation process)
                        session.encrypt.send_message(request, {response: 60000, timeout_msg: timeout_msg, countdown_cb: countdown_cb}, function (response) {
                            var pgm = controller + '.send_chat_msg.step_3_check_transactions.check_transaction send_message callback: ';
                            self.money_transactions_countdown = null ;
                            console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                            //response = {
                            //    "msgtype": "prepare_mt_response",
                            //    "jsons": [{"return_address": "2N4msGN4EZEJGbMpPVndRKkyQzHCzeQxF4X"}]
                            //};
                            // test 133: response = {"msgtype":"response"}
                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // OK. Timeout. Continue with next session
                                set_ping_error(wallet_name, 'Wallet validate timeout', true) ;
                                return check_transaction(); // check next wallet (if any)
                            }
                            if (!response || response.error) {
                                // empty or error.
                                if (response.error) {
                                    error = moneyNetworkService.sanitize(response.error) ;
                                }
                                else {
                                    console.log(pgm + 'wallet validation error. response = ' + JSON.stringify(response)) ;
                                    error = 'Wallet validating error' ;
                                }
                                set_ping_error(wallet_name, error, true) ;
                                return check_transaction(); // check next wallet (if any)
                            }
                            if (response.msgtype == 'response') {
                                // OK response to prepare_mt_request is not allowed.
                                // must be either an error response or a prepare_mt_response
                                error = 'Wallet validating error. Invalid response. Expected either a prepare_mt_response or an error response. Received a OK response' ;
                                console.log(pgm + error) ;
                                set_ping_error(wallet_name, error, true);
                                return check_transaction(); // check next wallet (if any)
                            }
                            if (request.money_transactions.length != response.jsons.length) {
                                error = 'Wallet validating error. Invalid response. Expected ' + request.money_transactions.length + ' jsons. Found ' + response.jsons.length + ' jsons' ;
                                console.log(pgm + error) ;
                                set_ping_error(wallet_name, error, true);
                                return check_transaction(); // check next wallet (if any)
                            }
                            // copy jsons to self.money_transactions
                            for (i=0 ; i<wallets_hash[wallet_name].money_transactions.length ; i++) {
                                j = wallets_hash[wallet_name].money_transactions[i] ;
                                money_transaction = self.money_transactions[j] ;
                                money_transaction.json = response.jsons[i];
                            }
                            console.log(pgm + 'self.money_transactions = ' + JSON.stringify(self.money_transactions));
                            //money_transactions = [{
                            //    "action": "Send",
                            //    "currency": "tBTC Test Bitcoin from MoneyNetworkW2",
                            //    "amount": "10000",
                            //    "unit": "Satoshi",
                            //    "$$hashKey": "object:3041",
                            //    "message": {
                            //        "html": {},
                            //        "ping": null,
                            //        "balance": "Wallet balance 1.3 BitCoin = 130000000 Satoshi"
                            //    },
                            //    "json": {"return_address": "2MvFbmMufMUfuGEFdaRqMaA67rx4cTCEbNS"}
                            //}, {
                            //    "action": "Request",
                            //    "currency": "tBTC Test Bitcoin from MoneyNetworkW2",
                            //    "amount": "20000",
                            //    "unit": "Satoshi",
                            //    "$$hashKey": "object:3084",
                            //    "message": {
                            //        "html": {},
                            //        "ping": null,
                            //        "balance": "Wallet balance 1.3 BitCoin = 130000000 Satoshi"
                            //    },
                            //    "json": {"address": "2N4sf597YmDugmqR92bLwg3ddxE8EsMefyp"}
                            //}];

                            // check next wallet (if any)
                            check_transaction() ;

                        }) ; // send_message callback

                    } ; // check_transaction
                    // start check_transaction loop
                    check_transaction() ;

                } ; // step_3_check_transactions
                
                // callback function - optional step - money transactions only - ping wallet sessions
                step_2_ping_wallets = function () {
                    var pgm = controller + '.send_chat_msg.step_2_ping_wallets: ';
                    var i, money_transaction, unique_text, sessions, j, balance, wallet_name, ping_wallet ;
                    if (!self.show_money) return step_3_check_transactions() ; // no money - continue with next step

                    self.new_chat_msg_disabled = 'Pinging wallet(s) ...' ;
                    console.log(pgm + self.new_chat_msg_disabled);

                    // todo: unique_text is unique text for wallet and currency. not unique text for wallet only. only one ping for each wallet. Not one ping for each currency code in wallet. test with a wallet with two currencies

                    // ping wallet(s). fast response. relevant wallet(s) must be open and ready before sending chat with money transaction(s)
                    // find wallet names and sessionids before ping wallets
                    // wallets_hash is also used in step_3_check_transactions
                    sessions = [] ;
                    for (i=0 ; i<self.money_transactions.length ; i++) {
                        money_transaction = self.money_transactions[i] ;
                        console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction));
                        if (!money_transaction.message) money_transaction.message = {} ;
                        delete money_transaction.message.ping ; // delete any old ping error message
                        delete money_transaction.message.open_wallet ; // delete any old show wallet link
                        if (self.money_transaction_is_empty(money_transaction)) continue ;
                        unique_text = money_transaction.currency ;
                        balance = moneyNetworkService.get_currency_by_unique_text(money_transaction.currency) ;
                        if (balance) {
                            wallet_name = balance.wallet_name ;
                            // todo. issue #208 and issue #253. sessionid from balance (get_currencies) cannot be used in ping. not always correct
                            if (!wallets_hash[wallet_name]) {
                                wallets_hash[wallet_name] = {
                                    sessionid: balance.sessionid,
                                    session: null,
                                    money_transactions: [],
                                    money_transactionid: null
                                };
                            }
                            wallets_hash[wallet_name].money_transactions.push(i) ;
                            sessions.push({wallet_name: wallet_name, sessionid: balance.sessionid}) ;
                        }
                        else set_ping_error(unique_text, 'Cannot ping unknown wallet (unique_text)') ;
                    } // for i
                    console.log(pgm + 'wallets_hash      = ' + JSON.stringify(wallets_hash)) ;
                    console.log(pgm + 'sessions = ' + JSON.stringify(sessions)) ;

                    self.new_chat_msg_disabled = 'Pinging wallet' + (sessions.length > 1 ? 's' : '') + ' ...';
                    console.log(pgm + self.new_chat_msg_disabled) ;

                    // ping wallet sessions. one loop for each session in sessions array
                    // results:
                    // a) ping OK. wallet is ready. ready to send money transaction(s) to wallet session for validation
                    // b) ping timeout. wallet not ready. user should open or reload wallet in an other browser tab
                    // c) ping error. system error. cannot send money transaction. stop send_chat_msg
                    // todo: DRY: see also approve_money_transactions.step_2_ping_wallets. almost identical code
                    ping_wallet = function () {
                        var pgm = controller + '.send_chat_msg.step_2_ping_wallets.ping_wallet: ';
                        var session_info, i, money_transaction, errors, error ;
                        if (!sessions.length) {
                            // done pinging wallet sessions. count number of ping errors
                            errors = 0 ;
                            for (i=0 ; i<self.money_transactions.length ; i++) {
                                money_transaction = self.money_transactions[i] ;
                                if (money_transaction.message.ping) errors++ ;
                            }
                            if (errors) {
                                // one or more wallet ping errors. stop end chat message
                                self.new_chat_msg_disabled = false ;
                                $rootScope.$apply() ;
                                error =
                                    'Sorry. Wallet ping error' + (errors > 1 ? 's' : '') + '.' +
                                    '<br>Cannot validate money transaction.' +
                                    '<br>Please open and/or check wallet in other browser tab.' ;
                                z_wrapper_notification(['error', error]) ;
                                return ;
                            }
                            // no wallet ping errors. continue
                            console.log(pgm + 'done pinging wallet sessions. send transactions to wallets for validation');
                            return step_3_check_transactions() ;
                        }
                        session_info = sessions.shift() ;
                        console.log(pgm + 'getting session. using sessionid = ' + session_info.sessionid + '. maybe wrong sessionid. see issue #208');
                        MoneyNetworkAPILib.get_session(session_info.sessionid, function (session) {
                            var pgm = controller + '.send_chat_msg.step_2_ping_wallets.ping_wallet get_session callback 1: ';
                            var request, error, timeout_msg, countdown_cb ;
                            if (!session) {
                                error = 'error. could not ping ' + session_info.wallet_name + ' wallet. ' +
                                    'could not find any old session with sessionid ' + session_info.sessionid +
                                    '. please check any previous error in log for sessionid ' + session_info.sessionid ;
                                console.log(pgm + error) ;
                                set_ping_error(session_info.wallet_name, 'Cannot ping unknown wallet (sessionid)', false) ;
                                return ping_wallet() ; // next wallet session (if any)
                            }
                            // save session. also used in step_3_check_transactions
                            wallets_hash[session_info.wallet_name].session = session ;
                            // send ping. timeout max 10 seconds. Expects Timeout or OK response
                            request = { msgtype: 'ping' };
                            timeout_msg = ['info', 'Issue with ping wallet timeout may have been solved<br>Please try again (Send chat message)', 10000] ;
                            countdown_cb = function (countdown) {
                                self.money_transactions_countdown = countdown ;
                                $scope.$apply() ;
                            } ;
                            session.encrypt.send_message(request, {response: 10000, timeout_msg: timeout_msg, countdown_cb: countdown_cb}, function (response) {
                                var pgm = controller + '.send_chat_msg.step_2_ping_wallets.ping_wallet send_message callback 2: ';
                                self.money_transactions_countdown = null ;
                                if (response && response.error && response.error.match(/^Timeout /)) {
                                    // OK. Timeout. Continue with next session
                                    console.log(pgm + 'ping wallet timeout for sessionid ' + session_info.sessionid) ;
                                    set_ping_error(session_info.wallet_name, 'Wallet ping timeout', true) ;
                                    return ping_wallet(); // next session (if any)
                                }
                                if (!response || response.error) {
                                    // Unexpected error.
                                    error = 'error. ping sessionid ' + session_info.sessionid + ' returned ' + JSON.stringify(response) ;
                                    console.log(pgm + error) ;
                                    error = 'Wallet ping error' + (response.error ? ' ' + sanitize(response.error) : '') ;
                                    set_ping_error(session_info.wallet_name, error, true) ;
                                    return ping_wallet(); // next session (if any)
                                }
                                // ping OK. wallet session
                                console.log(pgm + 'wallet session ping OK. session_info = ' + JSON.stringify(session_info)) ;
                                set_ping_error(session_info.wallet_name, null) ;
                                ping_wallet() ; // next session (if any)

                            }) ; // send_message callback 2

                        }) ; // get_session callback 1

                    } ; // ping_wallet
                    // start ping wallet sessions loop
                    ping_wallet() ;

                } ; // step_2_ping_wallets

                step_1_confirm_send = function () {
                    var pgm = controller + '.send_chat_msg.step_1_confirm_send: ';
                    // send msg. confirm send if chatting to an "old" contact
                    var warning ;
                    if (contact && (contact.type != 'group') &&
                        (warning=moneyNetworkService.is_old_contact(contact,true)) &&
                        (self.confirmed_send_chat != contact.unique_id)) {
                        ZeroFrame.cmd("wrapperConfirm", [warning + '<br>Send message anyway?', "Send"], function (confirm) {
                            if (!confirm) {
                                self.new_chat_msg_disabled = false ;
                                return ;
                            }
                            // only ask for confirmation once for contact
                            self.confirmed_send_chat = contact.unique_id ;
                            step_2_ping_wallets() ;
                        }) ;
                        return ;
                    }
                    self.confirmed_send_chat = null ; // no warning
                    step_2_ping_wallets() ;
                } ; // step_1_confirm_send

                // start callback chain step 1..3
                step_1_confirm_send();

            }; // send_chat_msg

            self.changed_chat_msg = "";
            self.edit_chat_msg = function (message, spam) {
                var pgm = controller + '.edit_chat_msg: ';
                var textarea_id, img_id, focus_textarea, update_zeronet, msg_text ;
                // console.log(pgm + 'message.message = ' + JSON.stringify(message.message));
                if ((message.message.folder == 'outbox') && (message.message.message.msgtype == 'chat msg')) {
                    // edit previously sent chat message. open edit/delete message dialog
                    message.edit_chat_message = true;
                    // angularJS cheat - ng-bind is too slow - using id for get/set textarea value. Maybe also a problem with handleTextAreaHeight?
                    textarea_id = chatEditTextAreaId(message);
                    document.getElementById(textarea_id).value = message.message.message.message;
                    console.log(pgm + 'textarea_id = ' + textarea_id +
                        ', message.message.message.message = ' + message.message.message.message +
                        ', document.getElementById(textarea_id).value = ' + document.getElementById(textarea_id).value) ;
                    img_id = chatEditImgId(message) ;
                    // console.log(pgm + 'img_id = ' + img_id);
                    if (message.message.message.image) {
                        message.message.message.original_image = message.message.message.image ;
                        document.getElementById(img_id).src = message.message.message.image ;
                    }
                    // focus to edit chat message textarea field
                    focus_textarea = function () {
                        console.log(pgm + 'focus_textarea start') ;
                        var id = textarea_id + '' ;
                        var elem = document.getElementById(id) ;
                        if (elem) {
                            console.log(pgm + 'id = ' + id + ', value = ' + elem.value) ;
                            elem.focus() ;
                            console.log(pgm + 'focus_textarea end') ;
                            $scope.$apply() ;
                        }
                        else console.log(pgm + 'textarea element with id ' + id + ' was not found in page') ;
                    };
                    $timeout(focus_textarea);
                }
                else if (message.message.message.money_transactions) {
                    console.log(pgm + 'inbox message with money transactions. confirm before delete') ;
                    msg_text = formatChatMessage(message);
                    if (msg_text.length > 40) msg_text = msg_text.substring(0, 20) + "..." + msg_text.substring(msg_text.length - 15);
                    ZeroFrame.cmd("wrapperConfirm", ['Chat message with money transactions!<br>Delete "' + msg_text + '"?', "Delete"], function (confirmed) {
                        if (!confirmed) return;

                        // console.log(pgm + 'delete message. message = ' + JSON.stringify(message));
                        // logical delete here. physical delete in ls_save_contacts
                        message.chat_filter = false ;
                        if (spam) {
                            // move contact to ignored list and hide ignored list
                            message.contact.type = 'ignore' ;
                            if (self.setup.contact_filters.ignore == 'green') self.toggle_filter('ignore', spam) ;
                            update_zeronet = false ;
                        }
                        else {
                            // message.message.deleted_at = new Date().getTime();
                            update_zeronet = moneyNetworkService.recursive_delete_message(message) ;
                        } // logical delete.
                        // if (apply) $scope.$apply();
                        // update localStorage and optional zeronet
                        // var update_zeronet = ((message.message.folder == 'outbox') && message.message.zeronet_msg_id) ;
                        moneyNetworkService.ls_save_contacts(update_zeronet); // physical delete

                    }) ;
                }
                else {
                    //// just delete other type of messages from localStorage (ingoing chat messages, contact added, contact deleted etc)
                    //var msg_text = formatChatMessage(message);
                    //if (msg_text.length > 40) msg_text = msg_text.substring(0, 20) + "..." + msg_text.substring(msg_text.length - 15);
                    //// console.log(pgm + 'msg_text.length = ' + msg_text.length);
                    //ZeroFrame.cmd("wrapperConfirm", ['Delete "' + msg_text + '" message?', "Delete"], function (confirmed) {
                    //    if (!confirmed) return;

                    // console.log(pgm + 'delete message. message = ' + JSON.stringify(message));
                    // logical delete here. physical delete in ls_save_contacts
                    message.chat_filter = false ;
                    if (spam) {
                        // move contact to ignored list and hide ignored list
                        message.contact.type = 'ignore' ;
                        if (self.setup.contact_filters.ignore == 'green') self.toggle_filter('ignore', spam) ;
                        update_zeronet = false ;
                    }
                    else {
                        // message.message.deleted_at = new Date().getTime();
                        update_zeronet = moneyNetworkService.recursive_delete_message(message) ;
                    } // logical delete.
                    // if (apply) $scope.$apply();
                    // update localStorage and optional zeronet
                    // var update_zeronet = ((message.message.folder == 'outbox') && message.message.zeronet_msg_id) ;
                    moneyNetworkService.ls_save_contacts(update_zeronet); // physical delete
                }
            }; // edit_chat_msg
            self.edit_chat_message_remove_image = function (message) {
                // remove from UI and message. old image is still in message.message.message.original_image ;
                var img_id = chatEditImgId(message) ;
                document.getElementById(img_id).src = '' ;
                delete message.message.message.image ;
            } ;
            self.cancel_edit_chat_msg = function (message) {
                var pgm = controller + '.cancel_edit_chat_msg: ';
                // angularJS cheat - ng-bind is too slow - using id for get/set textarea value. Maybe also a problem with handleTextAreaHeight?
                delete message.edit_chat_message ;
                var textarea_id = chatEditTextAreaId(message);
                textarea_id.value = '' ;
                if (message.message.message.original_image) {
                    message.message.message.image = message.message.message.original_image ;
                    delete message.message.message.original_image ;
                }
                var img_id = chatEditImgId(message) ;
                delete document.getElementById(img_id).src ;
            }; // cancel_edit_chat_msg
            self.save_chat_msg = function (message) {
                var pgm = controller + '.save_chat_msg: ';
                // angularJS cheat - ng-bind is too slow - using id for get/set textarea value.
                var textarea_id, old_value, new_value, old_image, new_image, img_id, new_message, parent ;
                textarea_id = chatEditTextAreaId(message);
                old_value = message.message.message.message;
                new_value = document.getElementById(textarea_id).value;
                parent = message.message.message.parent ;
                document.getElementById(textarea_id).value = '' ;
                MoneyNetworkHelper.debug('outbox && unencrypted', pgm + 'old message = ' + JSON.stringify(message.message));
                MoneyNetworkHelper.debug('outbox && unencrypted', pgm + 'old value = ' + old_value);
                MoneyNetworkHelper.debug('outbox && unencrypted', pgm + 'new value = ' + new_value);
                old_image = message.message.message.original_image ;
                delete message.message.message.original_image ;
                img_id = chatEditImgId(message) ;
                new_image = document.getElementById(img_id).src ;
                if (new_image.match(/^http/)) new_image = null ;
                document.getElementById(img_id).src = '' ;
                delete message.edit_chat_message;
                if ((!new_value || (old_value == new_value)) && (old_image == new_image)) return;
                if (message.contact.type == 'public') {
                    // delete old message
                    moneyNetworkService.recursive_delete_message(message) ;
                    //message.message.deleted_at = new Date().getTime() ;
                    //message.chat_filter = false ;

                    // create new message
                    // send chat message to contact
                    new_message = {
                        msgtype: 'chat msg',
                        message: new_value
                    };
                    if (new_image) new_message.image = new_image ;
                    if (parent) new_message.parent = parent ;
                    MoneyNetworkHelper.debug('outbox && unencrypted', pgm + 'new_message = ' + JSON.stringify(new_message));
                    // validate json
                    error = MoneyNetworkHelper.validate_json(pgm, new_message, new_message.msgtype, 'Could not send chat message');
                    if (error) {
                        z_wrapper_notification( ["Error", error]);
                        return;
                    }
                    // console.log(pgm + 'last_sender_sha256 = ' + last_sender_sha256);
                    // send message
                    moneyNetworkService.add_msg(null, new_message);
                    moneyNetworkService.ls_save_contacts(true);
                    return ;
                    // update public outbox message
                }
                // send changed chat message
                var changed_message = {
                    msgtype: 'chat msg',
                    old_local_msg_seq: message.message.local_msg_seq,
                    message: new_value
                };
                // add image.
                // unchanged image will be replaced with a "x" in communication. See z_update_data_json and process_incoming_message
                if (new_image) changed_message.image = new_image ;
                if (parent) changed_message.parent = parent ;
                console.log(pgm + 'changed_message = ' + JSON.stringify(changed_message));
                // validate json
                var error = MoneyNetworkHelper.validate_json(pgm, changed_message, changed_message.msgtype, 'Could not send changed chat message');
                if (error) {
                    z_wrapper_notification( ["Error", error]);
                    return;
                }
                if (new_image && (old_image == new_image)) changed_message.replace_unchanged_image_with_x = true ;
                // console.log(pgm + 'last_sender_sha256 = ' + last_sender_sha256);
                // send message
                moneyNetworkService.add_msg(message.contact, changed_message);
                // delete old message
                console.log(pgm + 'todo: keep old message in some kind of edit history?');
                //message.message.deleted_at = new Date().getTime() ;
                //message.chat_filter = false ;
                moneyNetworkService.recursive_delete_message(message) ;
                // save localStorage and update ZeroNet
                moneyNetworkService.ls_save_contacts(true) ;
            }; // save_chat_msg
            self.delete_edit_chat_msg = function (message) {
                // called from edit chat message form. Always outbox message
                var pgm = controller + '.delete_edit_chat_msg: ';
                var msg_text, update_zeronet ;
                msg_text = formatChatMessage(message);
                if (!message.message.sent_at || !msg_text) {
                    console.log(pgm + 'error cleanup. deleting message without a sent_at timestamp / message. message.message = ' + JSON.stringify(message.message)) ;
                    moneyNetworkService.remove_message(message) ;
                    moneyNetworkService.ls_save_contacts(false);
                    return ;
                }
                if ((message.contact.type == 'public') || (message.message.z_filename)) {
                    // public unencrypted chat. just delete
                    //delete message.edit_chat_message;
                    //message.message.deleted_at = new Date().getTime(); // logical delete
                    //message.chat_filter = false ;
                    debug('public_chat', pgm + 'deleted public outbox message ' + JSON.stringify(message.message)) ;
                    // save localStorage and update ZeroNet
                    //update_zeronet = (message.contact.type == 'public') ; // my outgoing public chat
                    update_zeronet = moneyNetworkService.recursive_delete_message(message) ;
                    moneyNetworkService.ls_save_contacts(update_zeronet); // physical delete
                    return ;
                }
                // person or group chat. confirm dialog and send a special empty delete chat message
                if (msg_text.length > 40) msg_text = msg_text.substring(0, 20) + "..." + msg_text.substring(msg_text.length - 15);
                // console.log(pgm + 'msg_text.length = ' + msg_text.length);
                ZeroFrame.cmd("wrapperConfirm", ['Delete "' + msg_text + '" message?', "Delete"], function (confirmed) {
                    if (!confirmed) return;
                    moneyNetworkService.recursive_delete_message(message) ;
                    //// console.log(pgm + 'deleting message ' + JSON.stringify(message));
                    //delete message.message.message.original_image ;
                    //// outbox: send delete chat message. note empty chat message
                    //var delete_message = {
                    //    msgtype: 'chat msg',
                    //    old_local_msg_seq: message.message.local_msg_seq
                    //};
                    //// console.log(pgm + 'delete_message = ' + JSON.stringify(delete_message));
                    //// validate json
                    //var error = MoneyNetworkHelper.validate_json(pgm, delete_message, delete_message.msgtype, 'Could not send delete chat message');
                    //if (error) {
                    //    ZeroFrame.cmd("wrapperNotification", ["Error", error]);
                    //    return;
                    //}
                    //// console.log(pgm + 'last_sender_sha256 = ' + last_sender_sha256);
                    //// send message
                    //moneyNetworkService.add_msg(message.contact, delete_message, false);
                    //self.messages[self.messages.length-1].chat_filter = false ;
                    //// delete old message
                    //delete message.edit_chat_message;
                    //message.message.deleted_at = new Date().getTime(); // logical delete
                    //message.chat_filter = false ;
                    //delete message.message.image;
                    // save localStorage and update ZeroNet
                    moneyNetworkService.ls_save_contacts(true);
                    // new empty chat message (delete message) will be logical delete marked in z_update_data_json and physical deleted in next ls_save_contacts call
                }); // wrapperConfrm
            }; // delete_edit_chat_msg

            // catch drag and drop new chat message image. see imagedrop directive. todo: refactor
            self.imageDropped = function () {
                var pgm = controller + '.imageDropped: ' ;

                // https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL
                var reader  = new FileReader();
                reader.addEventListener("load", function () {
                    var image_base64uri = reader.result ;
                    // console.log(pgm + 'reader.result = ' + image_base64uri);
                    var ext = moneyNetworkService.get_image_ext_from_base64uri(image_base64uri);
                    if (!ext) {
                        z_wrapper_notification(["error", "Sorry. Only png, jpg, jpeg, gif and tif images can be used in chat", 5000]);
                        return;
                    }
                    //var max_image_size = moneyNetworkService.get_max_image_size() ;
                    //if (image_base64uri.length * 0.75 > max_image_size) {
                    //    ZeroFrame.cmd("wrapperNotification", ["error", "Sorry. Image is too big. Max allowed size is about " + max_image_size + " bytes.", 5000]);
                    //    return;
                    //}

                    self.new_chat_src = image_base64uri ;
                    $scope.$apply() ;

                }, false);
                console.log($scope.uploadedFile) ;
                reader.readAsDataURL($scope.uploadedFile);

            }; // imageDropped

            // input file browse image - todo: refactor
            var new_chat_com_regexp = new RegExp('^new_chat_com_file_input_id_[0-9]+$') ;
            self.uploadImage = function(event){
                var pgm = controller + '.uploadImage: ' ;
                // what is the target for file upload? new_chat_src in top of page or edit chat message img scr
                var input_file_id = event.target.id ; // file-input, file-input2, edit_chat_file_input_id_115
                // console.log(pgm + 'input_file_id = ' + input_file_id);


                // https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL
                var reader  = new FileReader();
                reader.addEventListener("load", function () {
                    var image_base64uri = reader.result ;
                    var obj_id, hashkey, i, message ;
                    // console.log(pgm + 'reader.result = ' + image_base64uri);
                    var ext = moneyNetworkService.get_image_ext_from_base64uri(image_base64uri);
                    if (!ext) {
                        z_wrapper_notification(["error", "Sorry. Only png, jpg, jpeg, gif and tif images can be used in chat", 5000]);
                        return;
                    }
                    //var max_image_size = moneyNetworkService.get_max_image_size() ;
                    //if (image_base64uri.length * 0.75 > max_image_size) {
                    //    ZeroFrame.cmd("wrapperNotification", ["error", "Sorry. Image is too big. Max allowed size is about " + max_image_size + " bytes.", 5000]);
                    //    return;
                    //}

                    if (['file-input', 'file-input2'].indexOf(input_file_id) != -1) {
                        // image upload in new chat message form
                        self.new_chat_src = image_base64uri ;
                        $scope.$apply() ;
                    }
                    else if (input_file_id.match(new_chat_com_regexp)) {
                        // image upload in new chat comment form. id = new_chat_com_file_input_id_<n>
                        input_file_id_array = input_file_id.split('_');
                        obj_id = input_file_id_array[input_file_id_array.length-1] ;
                        console.log(pgm + 'new comment image. input_file_id = ' + input_file_id + ', obj_id = ' + obj_id) ;
                        hashkey = 'object:' + obj_id ;
                        for (i=0 ; i<self.messages.length ; i++) {
                            if (self.messages[i]['$$hashKey'] != hashkey) continue ;
                            message = self.messages[i] ;
                            message.comment_src = image_base64uri ;
                            $scope.$apply() ;
                            break ;
                        }
                        // console.log(pgm + 'message = ' + JSON.stringify(message)) ;
                    }
                    else {
                        // image upload in edit outgoing message (messages ng-repeat section)
                        // now var id = 'edit_chat_file_input_id_' + object_id ;
                        // copy to id = 'edit_chat_msg_img_id_' + object_id ;
                        console.log(pgm + 'input_file_id = ' + input_file_id) ;
                        var input_file_id_array = input_file_id.split('_');
                        var edit_chat_msg_img_id = 'edit_chat_msg_img_id_' + input_file_id_array[input_file_id_array.length-1] ;
                        console.log(pgm + 'edit_chat_msg_img_id = ' + edit_chat_msg_img_id) ;
                        document.getElementById(edit_chat_msg_img_id).src = image_base64uri ;
                        $scope.$apply() ;
                    }

                }, false);
                reader.readAsDataURL(event.target.files[0]);

            }; // uploadImage

            self.new_chat_src_remove = function() {
                self.new_chat_src = '' ;
            } ;



            self.show_money = false ; // show/hide money fields in new chat

            self.money_actions = [ 'Send', 'Request'] ;

            self.currencies = null ; // list with currencies. initialize in first new_chat_add_money request

            self.new_chat_add_money = function() {
                var pgm = controller + '.new_chat_add_money: ' ;
                var contact, currencies ;

                if (!ZeroFrame.site_info.cert_user_id || !moneyNetworkService.get_user_id()) {
                    z_wrapper_notification(['info', 'Cannot chat. Cannot send a money transaction', 5000]) ;
                    return ;
                }

                // money transactions are only allowed from private chat.
                // check group chat? find/create pseudo contact for this chat group.
                self.editing_grp_chat = false ;
                console.log(pgm + 'group_chat = ' + JSON.stringify(self.group_chat));
                if (self.group_chat) {
                    contact = find_group_chat_contact() ;
                    if (!contact) return ;
                    if (contact.type != 'group') {
                        self.contact = contact ;
                        self.group_chat = false;
                        self.group_chat_contacts = [];
                    }
                }
                if (!self.contact || self.group_chat) {
                    z_wrapper_notification( ['info', 'Money transactions are only available in private chat<br>Click on an avatar to start a private chat', 5000]) ;
                    return ;
                }

                // get list of currencies from connected wallets
                moneyNetworkService.get_currencies({}, function (currencies, refresh_angular_ui) {

                    console.log(pgm + 'currencies = ' + JSON.stringify(currencies));
                    console.log(pgm + 'todo: more currency info in ls_sessions. get_currencies call should be more like a refresh currencies request. currency info is used in chat (money transaction) and before get_currencies has been called');

                    if (!self.currencies) self.currencies = currencies ; // initialize currencies array used in UI
                    if (!self.currencies.length) {
                        z_wrapper_notification(['info', 'Cannot start money transaction<br>No wallets/currencies were found', 5000]) ;
                        return ;
                    }

                    // show/hide money. always reset money transactions array
                    self.money_transactions.splice(0,self.money_transactions.length) ;
                    self.money_transactions.push({action: null, currency: null, amount: null, unit: null}) ;
                    self.show_money = !self.show_money ;
                    console.log(pgm + 'show_money = ' + self.show_money) ;

                    if (refresh_angular_ui) $rootScope.$apply() ;

                    //sessions = {
                    //    "wslrlc5iomh45byjnblebpvnwheluzzdhqlqwvyud9mu8dtitus3kjsmitc1": {
                    //        "_$session_info": {
                    //            "url": "/1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                    //            "password": "U2FsdGVkX18MyosYqdGVowB1nw/7Nm2nbzATu3TexEXMig7rjInIIr13a/w4G5TzFLFz9GE+rqGZsqRP+Ms0Ez3w8cA9xNhPjtrhOaOkT1M=",
                    //            "pubkey": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCuM/Sevlo2UYUkTVteBnnUWpsd\n5JjAUnYhP0M2o36da15z192iNOmd26C+UMg0U8hitK8pOJOLiWi8x6TjvnaipDjc\nIi0p0l3vGBEOvIyNEYE7AdfGqW8eEDzzl9Cezi1ARKn7gq1o8Uk4U2fjkm811GTM\n/1N9IwACfz3lGdAm4QIDAQAB\n-----END PUBLIC KEY-----",
                    //            "pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
                    //            "last_request_at": 1504424728387,
                    //            "done": {
                    //                "1503315223138": 1503315232562,
                    //                "1503916247431": 1503916247859,
                    //                "1504261657652": 1504261664116,
                    //                "1504261977720": 1504261982693
                    //            },
                    //            "balance": [{"code": "tBTC", "amount": 1.3}],
                    //            "balance_at": 1504265571720,
                    //            "wallet_sha256": "6ef0247021e81ae7ae1867a685f0e84cdb8a61838dc25656c4ee94e4f20acb74"
                    //        }
                    //    }
                    //};

                    //currencies = [{
                    //    "code": "tBTC",
                    //    "amount": 1.3,
                    //    "balance_at": 1504265571720,
                    //    "sessionid": "wslrlc5iomh45byjnblebpvnwheluzzdhqlqwvyud9mu8dtitus3kjsmitc1",
                    //    "wallet_sha256": "6ef0247021e81ae7ae1867a685f0e84cdb8a61838dc25656c4ee94e4f20acb74",
                    //    "wallet_address": "1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                    //    "wallet_title": "MoneyNetworkW2",
                    //    "wallet_description": "Money Network - Wallet 2 - BitCoins www.blocktrail.com - runner jro",
                    //    "name": "Test Bitcoin",
                    //    "url": "https://en.bitcoin.it/wiki/Testnet",
                    //    "units": [{"unit": "BitCoin", "factor": 1}, {"unit": "Satoshi", "factor": 1e-8}]
                    //}];

                    console.log(pgm + 'todo: send money. enter currency and amount. must known currencies and amounts from my connected wallets') ;
                    console.log(pgm + 'todo: send money. not required but should know contacts preferred or connected currencies') ;
                    console.log(pgm + 'todo: send money. receiver must accept send money transaction');

                }) ;

            } ; // new_chat_add_money

            self.money_get_units = function (money_transaction) {
                var pgm = controller + '.money_get_units: ' ;
                var i ;
                console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction)) ;
                // money_transaction = {"action":"Send","currency":"tBTC Test Bitcoin from MoneyNetworkW2","amount":"1","$$hashKey":"object:140"}
                for (i=0 ; i<self.currencies.length ; i++) {
                    if (self.currencies[i].unique_text == money_transaction.currency) return self.currencies[i].units || ['n/a'] ;
                }
                return [] ;
            } ; // money_get_units

            // new money transaction. select currency for money transaction
            var empty_money_transaction = {action: null, currency: null, amount: null, unit: null} ;
            self.money_transactions = [ {action: null, currency: null, amount: null, unit: null} ] ;
            self.money_transaction_changed = function(name, money_transaction) {
                var pgm = controller + '.money_transaction_changed: ' ;
                var units ;
                console.log(pgm + 'name = ' + JSON.stringify(name) + ', money_transaction = ' + JSON.stringify(money_transaction) + ', self.money_transactions = ' + JSON.stringify(self.money_transactions)) ;
                if (name == 'currency') {
                    // currency changed. reset/set unit
                    money_transaction.unit = null ;
                    if (!money_transaction.currency) return ;
                    units = self.money_get_units(money_transaction) ;
                    if (units.length == 1) money_transaction.unit = units[0] ;
                } // currency change. reset unit

                console.log(pgm + 'todo: set money_transaction.message. error message and/or wallet balance') ;

            } ; // money_currency_changed
            self.money_transactions_countdown = null ;

            // insert money transaction row. tab/enter
            self.money_insert_row = function (money_transaction) {
                var pgm = controller + '.money_insert_row: ' ;
                console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction)) ;
                if (self.validate_money_transactions()) return ; // error. wait with new row
                if (self.money_transaction_is_empty(money_transaction)) return ; // wait. empty row
                var index ;
                for (var i=0 ; i<self.money_transactions.length ; i++) if (self.money_transactions[i].$$hashKey == money_transaction.$$hashKey) index = i ;
                index = index + 1 ;
                self.money_transactions.splice(index, 0, {action: null, currency: null, amount: null, unit: null});
                $scope.$apply();
            } ; // money_insert_row

            self.money_transaction_delete_row = function (money_transaction) {
                var index ;
                for (var i=0 ; i<self.money_transactions.length ; i++) if (self.money_transactions[i].$$hashKey == money_transaction.$$hashKey) index = i ;
                // console.log(pgm + 'row = ' + JSON.stringify(row)) ;
                self.money_transactions.splice(index, 1);
                if (self.money_transactions.length == 0) self.money_transactions.splice(index, 0, {action: null, currency: null, amount: null, unit: null});
            } ; // money_transaction_delete_row

            self.money_transaction_is_empty = function (money_transaction) {
                return (!money_transaction.action && !money_transaction.currency && !money_transaction.amount && !money_transaction.unit) ;
            } ; //money_transaction_is_empty
            
            self.money_amount_re = '^[+-]?[0-9]*(\.[0-9]+)?$' ;

            function red (html) {
                return '<span style="color:red;">' + html + '</span>' ;
            }

            // todo: should be used in send money transaction only. not working correct for incoing money transactions
            function format_money_transaction_message (money_transaction) {
                var messages = [] ;
                if (money_transaction.message.balance) messages.push(money_transaction.message.balance) ;
                if (money_transaction.message.required) messages.push(red(money_transaction.message.required)) ;
                if (money_transaction.message.ping) messages.push(red(money_transaction.message.ping)) ; // wallet ping error
                if (messages.length) money_transaction.message.html = $sce.trustAsHtml(messages.join('. ') + '.') ;
                else money_transaction.message.html = null ;
            } // format_money_transaction_message

            // set money_transaction.message. return error message
            // todo: balance should also be calculated for ingoing money transaction. directive?
            self.validate_money_transaction = function (money_transaction) {
                var pgm = controller + '.validate_money_transaction: ' ;
                var messages, amount, balances, balance, i, units, j, required ;
                if (!money_transaction.message) money_transaction.message = {} ;
                money_transaction.message.html = null ;
                if (self.money_transaction_is_empty(money_transaction)) return null ;
                // check (old) balance
                delete money_transaction.message.balance ;
                if (money_transaction.currency) {
                    // lookup balance
                    balances = [] ;
                    for (i=0 ; i<self.currencies.length ; i++) {
                        if (self.currencies[i].unique_text != money_transaction.currency) continue ;
                        amount = self.currencies[i].amount ;
                        // units": [{"unit": "BitCoin", "factor": 1}, {"unit": "Satoshi", "factor": 1e-8}]
                        units = self.currencies[i].units ;
                        for (j=0 ; j<units.length ; j++) {
                            balance = amount / units[j].factor + ' ' + units[j].unit ;
                            if (units[j].factor == 1) balances.unshift(balance) ;
                            else balances.push(balance) ;
                        } // for j
                    } // for k
                    if (balances.length) money_transaction.message.balance = 'Wallet balance ' + balances.join(' = ') ;
                }
                // validate row (required values)
                if (!money_transaction.action) required = 'Action (Send/Request) is required' ;
                else if (!money_transaction.currency) required = 'Currency is required' ;
                else if (!money_transaction.amount) required = 'Amount is required' ;
                else if (!money_transaction.unit) required = 'Unit is required' ;
                if (required) money_transaction.message.required = required ;
                else delete money_transaction.message.required ;
                // format message
                format_money_transaction_message(money_transaction) ;
                // return any required error message
                return required ;
            } ; // validate_money_transaction

            // validate money transaction(s). Empty money transaction = no money transaction
            // returns null (ok) or an error message
            self.validate_money_transactions = function (tab) {
                var pgm = controller + '.validate_money_transactions: ' ;
                var i, money_transaction, empty_rows, errors ;
                if (!self.show_money) return null ;
                empty_rows = false ;
                errors = 0 ;
                for (i=0 ; i<self.money_transactions.length ; i++) {
                    money_transaction = self.money_transactions[i] ;
                    if (self.money_transaction_is_empty(money_transaction)) {
                        empty_rows = true ;
                        continue ;
                    }
                    if (self.validate_money_transaction(money_transaction)) errors++ ;
                }
                if (errors) return 'Please enter requested information or delete money transaction' + (errors > 1 ? 's' : '');
                if (empty_rows || !tab) return null ;
                if (self.new_chat_msg_disabled == true) return 'Validating money transaction(s)' ;
                else if (self.new_chat_msg_disabled) return self.new_chat_msg_disabled ;
                else return 'Press <Tab> to insert extra rows' ;
            } ; // validate_money_transaction

            function format_money_transaction_message (money_transaction) {
                var pgm = controller + '.format_money_transaction_message: ' ;
                var messages = [] ;
                if (money_transaction.message.balance) messages.push(shy(money_transaction.message.balance)) ;
                if (money_transaction.message.ping) messages.push(red(shy(money_transaction.message.ping))) ;
                // wallet ping error (timeout or error)
                if (money_transaction.message.check) messages.push(red(shy(money_transaction.message.check))) ; // wallet check money transaction request error
                if (messages.length) money_transaction.message.html = $sce.trustAsHtml(messages.join('. ') + '.') ;
                else money_transaction.message.html = null ;
            } // format_money_transaction_message

            // approve incoming money transaction(s)
            self.approve_money_transactions = function (m) {
                var pgm = controller + '.approve_money_transactions: ' ;
                var step_1_check_unknown_wallets, step_2_ping_wallets, step_3_check_transactions,
                    step_4_start_transactions, unknown_wallets, balances, wallets_hash, set_ping_error, set_check_error, i ;
                console.log(pgm + 'click. message = ' + JSON.stringify(m.message)) ;
                //message = {
                //    "local_msg_seq": 5947,
                //    "folder": "inbox",
                //    "message": {
                //        "msgtype": "chat msg",
                //        "message": "receive money trans test 2",
                //        "money_transactions": [{
                //            "wallet_url": "1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                //            "wallet_sha256": "e488d78dc26af343688045189a714658ed0f7975d4db158a7c0c5d0a218bfac7",
                //            "wallet_name": "MoneyNetworkW2",
                //            "action": "Send",
                //            "code": "tBTC",
                //            "name": "Test Bitcoin",
                //            "amount": 0.0001,
                //            "money_transactionid": "3R1R46sRFEal8zWx0wYvYyo6VDLJmpFzVNsyIOhglPV4bcUgXqUDLOWrOkZA",
                //            "json": {"return_address": "2Mxufcnyzo8GvTGHqYfzS862ZqYaFYjxo5V"},
                //            "$$hashKey": "object:1276",
                //            "message": {"html": {}, "ping": "Wallet ping timeout"}
                //        }],
                //        "local_msg_seq": 13,
                //        "money_transactions_status": {
                //            "html": "Wallet ping failed. See red error message",
                //            "spinner": false
                //        }
                //    },
                //    "zeronet_msg_id": "255e4057027b69f540323d9f7ea5af3e71e239af09cdf64fb00817e0c2645f15",
                //    "sender_sha256": "46bc79914a723af23042d2e32530364ec9e5a5e47ca2a6e209899d9723e08fae",
                //    "sent_at": 1508650742026,
                //    "received_at": 1508650746070,
                //    "encryption": 1,
                //    "feedback": false,
                //    "ls_msg_size": 787,
                //    "seq": 223,
                //    "reactions": []
                //};

                // clear any old transaction error messages (ping error etc)
                for (i=0 ; i< m.message.message.money_transactions.length ; i++) {
                    delete m.message.message.money_transactions[i].message ;
                }

                // message.money_transactions_status object:
                // - html: current html message UI. Generated from other object properties or set dynamically
                // - done: timestamp: static html. keep html message as it is. No more processing is allowed
                if (!m.message.message.money_transactions_status) m.message.message.money_transactions_status = {} ;
                m.message.message.money_transactions_status.html = 'Checking ...' ;
                m.message.message.money_transactions_status.spinner = true ;

                // approve process:
                // - add wallet(s) to MN if unknown wallet
                // - user registering in wallet(s)
                // - ping wallet(s)
                // - validate wallet transaction(s) - all or nothing
                // - approve transactions(s) - wallet sessions will to the rest
                // - approved transaction(s) may fail with error message(s) in wallet(s) processing

                // unique_texts hash. used in step_2_ping_wallets and todo:
                balances = [] ; // from index in money_transactions to balance/currency record in currencies
                wallets_hash = {} ;

                // todo: when to initialize message.balance for incoming money transactions?

                set_ping_error = function (wallet_name, error) {
                    var pgm = controller + '.approve_money_transaction.set_ping_error: ';
                    var i, money_transaction, j ;
                    if (!wallets_hash[wallet_name]) throw pgm + 'System error. Unknown wallet name ' + wallet_name ;
                    if (!wallets_hash[wallet_name].money_transactions || !wallets_hash[wallet_name].money_transactions.length) throw pgm + 'System error. No money transactions found for wallet ' + wallet_name ;
                    for (i=0 ; i<wallets_hash[wallet_name].money_transactions.length ; i++) {
                        j = wallets_hash[wallet_name].money_transactions[i] ;
                        money_transaction = m.message.message.money_transactions[j] ;
                        if (!money_transaction.message) money_transaction.message = {} ;
                        money_transaction.message.ping = error ;
                        format_money_transaction_message(money_transaction) ;
                    } // for i
                } ; // set_ping_error

                set_check_error = function (wallet_name, error) {
                    var pgm = controller + '.approve_money_transaction.set_check_error: ';
                    var i, money_transaction, j ;
                    if (!wallets_hash[wallet_name]) throw pgm + 'System error. Unknown wallet name ' + wallet_name ;
                    if (!wallets_hash[wallet_name].money_transactions || !wallets_hash[wallet_name].money_transactions.length) throw pgm + 'System error. No money transactions found for wallet ' + wallet_name ;
                    for (i=0 ; i<wallets_hash[wallet_name].money_transactions.length ; i++) {
                        j = wallets_hash[wallet_name].money_transactions[i] ;
                        money_transaction = m.message.message.money_transactions[j] ;
                        if (!money_transaction.message) money_transaction.message = {} ;
                        money_transaction.message.check = error ;
                        format_money_transaction_message(money_transaction) ;
                    } // for i
                } ; // set_check_error


                // create callback chain step 1.. todo: n

                // wallet(s) responded OK to check_mt request(s). ready to start money transaction(s).
                step_4_start_transactions = function() {
                    var pgm = controller + '.approve_money_transactions.step_4_start_transactions: ' ;
                    var plural, wallet_names, wallet_name, start_trans ;

                    plural = (m.message.message.money_transactions.length > 1 ? 's' : '') ;
                    m.message.message.money_transactions_status.html = 'Starting money transaction' + plural + ' ...' ;
                    console.log(pgm + '_status.html = ' + m.message.message.money_transactions_status.html) ;
                    safeApply($scope) ;

                    // start money transactions for each wallet
                    wallet_names = [] ;
                    for (wallet_name in wallets_hash) wallet_names.push(wallet_name) ;

                    // loop for each wallet. send start_mt requests
                    start_trans = function() {
                        var pgm = controller + '.approve_money_transactions.step_4_start_transactions.start_trans: ' ;
                        var wallet_name, money_transactionid, session, request, countdown_cb ;
                        wallet_name = wallet_names.shift() ;
                        if (!wallet_name) {
                            // done.
                            // 1) done notification
                            // 2) prevent more actions (except cancel)
                            // 3) ?
                            m.message.message.money_transactions_status.html = 'Done. Started wallet to wallet communication' ;
                            console.log(pgm + '_status.html = ' + m.message.message.money_transactions_status.html) ;
                            m.message.message.money_transactions_status.spinner = false ;
                            safeApply($scope) ;
                            return ;
                        }

                        // ready to start money transaction(s) for wallet
                        money_transactionid = wallets_hash[wallet_name].money_transactionid ;
                        session = wallets_hash[wallet_name].session ;
                        request = {
                            msgtype: 'start_mt',
                            money_transactionid: money_transactionid
                        };
                        console.log(pgm + 'request = ' + JSON.stringify(request)) ;
                        countdown_cb = function (countdown) {
                            m.message.message.money_transactions_status.countdown = countdown ;
                            $scope.$apply() ;
                        } ;

                        // send start_mt request to wallet. expects a fast response. all info has been checked and is ready in wallet
                        session.encrypt.send_message(request, {response: 10000, countdown_cb: countdown_cb}, function (response) {
                            var pgm = controller + '.approve_money_transactions.step_4_start_transactions.start_trans send_message callback: ' ;
                            var error ;
                            m.message.message.money_transactions_status.countdown = null ;
                            console.log(pgm + 'response = ' + JSON.stringify(response)) ;

                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // OK. Timeout. Continue with next wallet
                                console.log(pgm, 'Timeout while waiting for start_mt response. Expects a timeout message from wallet in a few seconds with process information') ;
                                set_check_error(wallet_name, 'Start money transaction timeout. Money transaction may or may not have been started') ;
                                return start_trans(); // start trans in next wallet (if any)
                            }
                            if (!response || response.error) {
                                // empty or error.
                                if (response.error) error = sanitize(response.error) ;
                                else {
                                    console.log(pgm + 'start money transaction error. response = ' + JSON.stringify(response)) ;
                                    error = 'Start money tranaction error' ;
                                }
                                set_check_error(wallet_name, error) ;
                                return start_trans(); // start trans in next wallet (if any)
                            }
                            // done. OK response

                            // start trans in next wallet (if any)
                            start_trans() ;

                        }) ; // send_message callback

                    } ; // start_trans
                    // start start_trans loop
                    start_trans() ;

                } ; // step_4_start_transactions

                // send incoming money transaction(s) to wallet(s) for validation
                step_3_check_transactions = function() {
                    var pgm = controller + '.approve_money_transactions.step_3_check_transactions: ' ;
                    var plural, wallet_name, wallet_names, check_transaction ;

                    plural = (m.message.message.money_transactions.length > 1 ? 's' : '') ;
                    m.message.message.money_transactions_status.html = 'Checking money transaction' + plural + ' ...' ;
                    console.log(pgm + '_status.html = ' + m.message.message.money_transactions_status.html) ;
                    safeApply($scope) ;

                    // check money transactions for each wallet
                    wallet_names = [] ;
                    for (wallet_name in wallets_hash) wallet_names.push(wallet_name) ;

                    // loop for each wallet. send received money transaction(s) to wallet for check before final go
                    check_transaction = function() {
                        var pgm = controller + '.approve_money_transactions.step_3_check_transactions.check_transaction: ' ;
                        var wallet_name, errors, i, money_transaction, plural, error, money_transactionid, session, request, j, countdown_cb ;
                        wallet_name = wallet_names.shift() ;
                        if (!wallet_name) {
                            // done checking money transactions. count number of check errors
                            errors = 0 ;
                            for (i=0 ; i<m.message.message.money_transactions.length ; i++) {
                                money_transaction = m.message.message.money_transactions[i] ;
                                if (money_transaction.message.check) errors++ ;
                            }
                            if (errors) {
                                // one or more wallet ping errors. stop approve money transactions
                                plural = errors > 1 ? 's' : '' ;
                                error = 'Sorry. Cannot approve money transaction' ;
                                z_wrapper_notification( ['error', error]) ;
                                m.message.message.money_transactions_status.html = 'Transaction check failed. See red error message' + plural ;
                                console.log(pgm + '_status.html = ' + m.message.message.money_transactions_status.html) ;
                                m.message.message.money_transactions_status.spinner = false ;
                                safeApply($scope) ;
                                //try {$rootScope.$apply()}
                                //catch (e) {}
                                return ;
                            }
                            // done. ready for start_mt request
                            return step_4_start_transactions() ;
                        }

                        // ready to check incoming money transaction(s) for wallet
                        money_transactionid = wallets_hash[wallet_name].money_transactionid ;

                        // get session
                        session = wallets_hash[wallet_name].session ;
                        // build validate money transactions request
                        // contact. receiver of chat message / money transaction. auth_address is unique user id. cert_user_id and alias are human text fields and are not unique / secure

                        request = {
                            msgtype: 'check_mt',
                            contact: {
                                alias: moneyNetworkService.get_contact_name(m.contact),
                                cert_user_id: m.contact.cert_user_id,
                                auth_address: m.contact.auth_address
                            },
                            open_wallet: true,
                            money_transactions: [],
                            money_transactionid: money_transactionid
                        } ;
                        for (i=0 ; i<wallets_hash[wallet_name].money_transactions.length ; i++) {
                            j = wallets_hash[wallet_name].money_transactions[i];
                            money_transaction = money_transaction = m.message.message.money_transactions[j];
                            request.money_transactions.push({
                                action: money_transaction.action,
                                code: money_transaction.code,
                                amount: money_transaction.amount,
                                json: money_transaction.json
                            }) ;
                        } // for i
                        console.log(pgm + 'request = ' + JSON.stringify(request)) ;
                        //request = {
                        //    "msgtype": "check_mt",
                        //    "contact": {
                        //        "alias": "1MirY1KnJK3MK",
                        //        "cert_user_id": "1MirY1KnJK3MK@moneynetwork.bit",
                        //        "auth_address": "1MirY1KnJK3MKzgZiyZZM8FkyzHRJgmMh8"
                        //    },
                        //    "open_wallet": true,
                        //    "money_transactions": [{
                        //        "action": "Send",
                        //        "code": "tBTC",
                        //        "amount": 0.0001,
                        //        "json": {"return_address": "2Mxufcnyzo8GvTGHqYfzS862ZqYaFYjxo5V"}
                        //    }],
                        //    "money_transactionid": "3R1R46sRFEal8zWx0wYvYyo6VDLJmpFzVNsyIOhglPV4bcUgXqUDLOWrOkZA"
                        //};

                        if (request.money_transactions.length != wallets_hash[wallet_name].money_transactions.length) {
                            error = 'Error. Expected ' + wallets_hash[wallet_name].money_transactions.length + ' money transactions in request. found ' + request.money_transactions.length;
                            console.log(pgm + error) ;
                            set_check_error(wallet_name, error) ;
                            return check_transaction() ;
                        }
                        countdown_cb = function (countdown) {
                            m.message.message.money_transactions_status.countdown = countdown ;
                            $scope.$apply() ;
                        } ;

                        // send validate money transactions request to wallet (wait max 60 seconds. wallet may call external API in validation process)
                        session.encrypt.send_message(request, {response: 60000, countdown_cb: countdown_cb}, function (response) {
                            var pgm = controller + '.approve_money_transactions.step_3_check_transactions.check_transaction send_message callback: ';
                            m.message.message.money_transactions_status.countdown = null ;
                            console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                            //response = {
                            //    "msgtype": "prepare_mt_response",
                            //    "jsons": [{"return_address": "2N4msGN4EZEJGbMpPVndRKkyQzHCzeQxF4X"}]
                            //};

                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // OK. Timeout. Continue with next session
                                set_check_error(wallet_name, 'Money transaction check timeout') ;
                                return check_transaction(); // check next wallet (if any)
                            }
                            if (!response || response.error) {
                                // empty or error.
                                if (response.error) error = sanitize(response.error) ;
                                else {
                                    console.log(pgm + 'wallet validation error. response = ' + JSON.stringify(response)) ;
                                    error = 'Wallet validating error' ;
                                }
                                set_check_error(wallet_name, error) ;
                                return check_transaction(); // check next wallet (if any)
                            }
                            // done. OK response

                            // check next wallet (if any)
                            check_transaction() ;

                        }) ; // send_message callback

                    } ; // check_transaction
                    // start check transaction loop
                    check_transaction() ;
                } ; // step_3_check_transactions

                // todo: DRY: copy/paste from send_chat_msg.step_2_ping_wallets + small changes
                step_2_ping_wallets = function () {
                    var pgm = controller + '.approve_money_transactions.step_2_ping_wallets: ' ;
                    var sessions, i, money_transaction, balance, wallet_name, ping_wallet, closed_wallets ;

                    // todo: only one ping for each wallet. Not one ping for each currency code in wallet. test with a wallet with two currencies

                    // ping wallet(s). fast response. relevant wallet(s) must be open and ready before sending chat with money transaction(s)
                    // find wallet names and sessionids before ping wallets
                    // wallets_hash is also used in step_3_ todo:xxx
                    sessions = [] ;
                    for (i=0 ; i< m.message.message.money_transactions.length ; i++) {
                        money_transaction = m.message.message.money_transactions[i] ;
                        balance = balances[i] ;
                        if (!money_transaction.message) money_transaction.message = {} ;
                        delete money_transaction.message.ping ; // delete any old ping error message
                        console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction));
                        wallet_name = balance.wallet_name ;
                        if (!wallets_hash[wallet_name]) {
                            wallets_hash[wallet_name] = {
                                sessionid: balance.sessionid,
                                session: null,
                                money_transactions: [],
                                money_transactionid: money_transaction.money_transactionid
                            } ;
                            sessions.push({wallet_name: wallet_name, sessionid: balance.sessionid}) ;
                        }
                        else {
                            // control. multiple money transaction for same wallet.
                            // all money transactions must have identical sessionid and money_transactionid
                            if (wallets_hash[wallet_name].sessionid != balance.sessionid) {
                                console.log(pgm + 'error. expected wallets_hash[wallet_name].sessionid = ' + wallets_hash[wallet_name].sessionid + '. found balance.sessionid = ' + balance.sessionid) ;
                                m.message.message.money_transactions_status.html = 'Cannot approve money transaction<br>Non unique sessionid' ;
                                m.message.message.money_transactions_status.spinner = false ;
                                safeApply($scope) ;
                                return ;
                            }
                            if (wallets_hash[wallet_name].money_transactionid != money_transaction.money_transactionid) {
                                console.log(pgm + 'error. expected wallets_hash[wallet_name].money_transactionid = ' + wallets_hash[wallet_name].money_transactionid + '. found money_transaction.money_transactionid = ' + money_transaction.money_transactionid)
                                m.message.message.money_transactions_status.html = 'Cannot approve money transaction<br>Non unique money_transactionid' ;
                                m.message.message.money_transactions_status.spinner = false ;
                                safeApply($scope) ;
                                return ;
                            }
                        }
                        wallets_hash[wallet_name].money_transactions.push(i) ;
                    } // for i
                    console.log(pgm + 'wallets_hash = ' + JSON.stringify(wallets_hash)) ;
                    console.log(pgm + 'sessions = ' + JSON.stringify(sessions)) ;
                    if (Object.keys(wallets_hash).length == 1) {
                        m.message.message.money_transactions_status.html = 'Pinging wallet ...' ;
                        console.log(pgm + '_status.html = ' + m.message.message.money_transactions_status.html) ;
                        safeApply($scope) ;
                        //try {$rootScope.$apply()}
                        //catch (e) {}
                    }
                    closed_wallets = [] ;

                    // ping wallet sessions. one loop for each session in sessions array
                    // results:
                    // a) ping OK. wallet is ready. ready to receive money transaction(s) in wallet session for validation
                    // b) ping timeout. wallet not ready. user should open or reload wallet in an other browser tab
                    // c) ping error. system error. cannot receive transaction. stop processing
                    ping_wallet = function() {
                        var pgm = controller + '.approve_money_transactions.step_2_ping_wallets.ping_wallet: ' ;
                        var plural ;

                        var session_info, i, money_transaction, errors, error ;
                        if (!sessions.length) {
                            // done pinging wallet sessions. count number of ping errors
                            errors = 0 ;
                            for (i=0 ; i<m.message.message.money_transactions.length ; i++) {
                                money_transaction = m.message.message.money_transactions[i] ;
                                if (money_transaction.message.ping) errors++ ;
                            }
                            if (errors) {
                                // one or more wallet ping errors. stop approve money transactions
                                plural = errors > 1 ? 's' : '' ;
                                error =
                                    'Sorry. Wallet ping error' + plural + '.' +
                                    '<br>Cannot validate money transaction.' +
                                    '<br>Please open and/or check wallet' + plural + ' in other browser tab.' ;
                                z_wrapper_notification(['error', error]) ;
                                m.message.message.money_transactions_status.html = 'Wallet ping failed. See red error message' + plural ;
                                console.log(pgm + '_status.html = ' + m.message.message.money_transactions_status.html) ;
                                m.message.message.money_transactions_status.spinner = false ;
                                safeApply($scope) ;
                                //try {$rootScope.$apply()}
                                //catch (e) {}
                                return ;
                            }
                            // no wallet ping errors. continue
                            console.log(pgm + 'done pinging wallet sessions. send transactions to wallets for validation');
                            return step_3_check_transactions() ;
                        }
                        session_info = sessions.shift() ;
                        console.log(pgm + 'getting session. using sessionid = ' + session_info.sessionid);
                        MoneyNetworkAPILib.get_session(session_info.sessionid, function (session) {
                            var pgm = controller + '.approve_money_transaction.step_2_ping_wallets.ping_wallet get_session callback 1: ';
                            var request, error, timeout_msg, countdown_cb ;
                            if (!session) {
                                error = 'error. could not ping ' + session_info.wallet_name + ' wallet. ' +
                                    'could not find any old session with sessionid ' + session_info.sessionid +
                                    '. please check any previous error in log for sessionid ' + session_info.sessionid ;
                                console.log(pgm + error) ;
                                set_ping_error(session_info.wallet_name, 'Cannot ping unknown wallet (sessionid)') ;
                                return ping_wallet() ; // next wallet session (if any)
                            }
                            // save session. also used in step_3_ todo: xxx
                            wallets_hash[session_info.wallet_name].session = session ;

                            // send ping. timeout max 10 seconds. Expects Timeout or OK response
                            // timeout 10 sec is an issue on slow running devices. For example vm2.
                            // but long timeout for a not running wallet session is also a problem.
                            // keeping 10 sec timeout
                            request = { msgtype: 'ping' };
                            timeout_msg = ['info', 'Issue with ping wallet timeout may have been solved<br>Please try again (Approve money transaction)', 10000] ;
                            countdown_cb = function (countdown) {
                                m.message.message.money_transactions_status.countdown = countdown ;
                                $scope.$apply() ;
                            } ;
                            session.encrypt.send_message(request, {response: 10000, timeout_msg: timeout_msg, countdown_cb: countdown_cb}, function (response) {
                                var pgm = controller + '.approve_money_transaction.step_2_ping_wallets.ping_wallet send_message callback 2: ';
                                m.message.message.money_transactions_status.countdown = null ;
                                if (response && response.error && response.error.match(/^Timeout /)) {
                                    // OK. Timeout. Continue with next session
                                    console.log(pgm + 'ping wallet timeout for sessionid ' + session_info.sessionid) ;
                                    set_ping_error(session_info.wallet_name, 'Wallet ping timeout') ;
                                    return ping_wallet(); // next session (if any)
                                }
                                if (!response || response.error) {
                                    // Unexpected error.
                                    error = 'error. ping sessionid ' + session_info.sessionid + ' returned ' + JSON.stringify(response) ;
                                    console.log(pgm + error) ;
                                    error = 'Wallet ping error' + (response.error ? ' ' + sanitize(response.error) : '') ;
                                    set_ping_error(session_info.wallet_name, error) ;
                                    return ping_wallet(); // next session (if any)
                                }
                                // ping OK. wallet session
                                console.log(pgm + 'wallet session ping OK. session_info = ' + JSON.stringify(session_info)) ;
                                set_ping_error(session_info.wallet_name) ;
                                ping_wallet() ; // next session (if any)

                            }) ; // send_message callback 2

                        }) ; // get_session callback 1

                    }; // ping_wallet
                    // start ping wallet sessions loop
                    ping_wallet() ;

                    console.log(pgm + 'todo: ping wallets (copy/paste)') ;
                } ; // step_2_ping_wallets

                unknown_wallets = [] ;
                step_1_check_unknown_wallets = function(index) {
                    var pgm = controller + '.approve_money_transactions.step_1_check_unknown_wallets: ' ;
                    var money_transaction, msg, plural ;
                    if (index >= m.message.message.money_transactions.length) {
                        // done. check for any unknown wallets
                        if (unknown_wallets.length) {
                            plural = (unknown_wallets.length > 1 ? 's' : '') ;
                            msg =
                                'Cannot approve money transaction<br>' +
                                'Unknown wallet' + plural + ' ' + unknown_wallets.join(', ') + '<br>' +
                                'Please add missing wallet' + plural + ' to MoneyNetwork' ;
                            z_wrapper_notification( ['error', msg, 5000]) ;
                            m.message.message.money_transactions_status.html = 'Unknown wallet' + plural;
                            console.log(pgm + '_status.html = ' + m.message.message.money_transactions_status.html) ;
                            m.message.message.money_transactions_status.spinner = false ;
                            safeApply($scope) ;
                            //try {$rootScope.$apply()}
                            //catch (e) {}
                            return ;
                        }
                        m.message.message.money_transactions_status.html = 'Pinging wallets ...';
                        console.log(pgm + '_status.html = ' + m.message.message.money_transactions_status.html) ;
                        safeApply($scope) ;
                        //try {$rootScope.$apply()}
                        //catch (e) {}
                        return step_2_ping_wallets() ;
                    } // done. next step
                    money_transaction = m.message.message.money_transactions[index] ;
                    moneyNetworkService.get_currencies({}, function (currencies, refresh_angular_ui) {
                        var pgm = controller + '.approve_money_transactions.step_1_check_unknown_wallets get_currencies callback 1: ' ;
                        var wallet_name, unknown_wallet, i, balance, sessionid, error ;
                        if (!self.currencies) self.currencies = currencies ; // // initialize currencies array used in UI
                        wallet_name = money_transaction.wallet_name ;
                        unknown_wallet = function () {
                            if (unknown_wallets.indexOf(wallet_name) == -1) unknown_wallets.push(wallet_name) ;
                            step_1_check_unknown_wallets(index+1) ;
                        } ;
                        if (!currencies || !currencies.length) return unknown_wallet() ;
                        // find sessionid. no sessionid = unknown wallet.
                        for (i=0 ; i<currencies.length ; i++) {
                            balance = currencies[i] ;
                            if ((money_transaction.wallet_sha256 == balance.wallet_sha256) ||
                                (money_transaction.wallet_url == balance.wallet_domain) ||
                                (money_transaction.wallet_url == balance.wallet_address)) {
                                sessionid = balance.sessionid ;
                                break ;
                            }
                        } // for i
                        if (!sessionid) return unknown_wallet() ;
                        // wallet exists. check currency code. should normally never by an issue
                        balances[index] = null ;
                        for (i = 0; i < currencies.length; i++) {
                            balance = currencies[i];
                            if (((money_transaction.wallet_sha256 == balance.wallet_sha256) ||
                                (money_transaction.wallet_url == balance.wallet_domain) ||
                                (money_transaction.wallet_url == balance.wallet_address)) &&
                                (money_transaction.code == balance.code)) {
                                balances[index] = balance;
                                break;
                            }
                        } // for i
                        if (!balances[index]) {
                            // only possible if wallet.json has been changed since money transaction was submitted. abort
                            plural = (m.message.message.money_transactions.length > 1 ? 's' : '') ;
                            error = 'Currency code was not found in ' + wallet_name + '<br>Please reject or edit money transaction' + plural ;
                            console.log(pgm + error) ;
                            z_wrapper_notification(['error', error]) ;
                            return ;
                        }
                        console.log(pgm + 'wallet ' + wallet_name + ', balance = ' + JSON.stringify(balance)) ;
                        //balance = {
                        //    "code": "tBTC",
                        //    "amount": 0,
                        //    "balance_at": 1507824156612,
                        //    "sessionid": "jmy0rxlogb3dhapw5s0eq6jorcm51l9uw4vejmryeg1mlltts4x6bn7tfqzx",
                        //    "wallet_sha256": "e488d78dc26af343688045189a714658ed0f7975d4db158a7c0c5d0a218bfac7",
                        //    "wallet_address": "1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                        //    "wallet_title": "MoneyNetworkW2",
                        //    "wallet_description": "Money Network - Wallet 2 - BitCoins www.blocktrail.com - runner jro",
                        //    "api_url": "https://www.blocktrail.com/api/docs",
                        //    "unique_id": "e488d78dc26af343688045189a714658ed0f7975d4db158a7c0c5d0a218bfac7/tBTC",
                        //    "name": "Test Bitcoin",
                        //    "url": "https://en.bitcoin.it/wiki/Testnet",
                        //    "fee_info": "Fee is calculated by external API (btc.com) and subtracted from amount. Calculated from the last X block in block chain. Lowest fee that still had more than an 80% chance to be confirmed in the next block.",
                        //    "units": [{"unit": "BitCoin", "factor": 1}, {"unit": "Satoshi", "factor": 1e-8}],
                        //    "wallet_name": "1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                        //    "unique_text": "tBTC Test Bitcoin from 1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1"
                        //};
                        // wallet in check next money transaction
                        step_1_check_unknown_wallets(index+1) ;
                    }) ; // get_currencies callback 1

                } ; // step_1_check_unknown_wallets
                step_1_check_unknown_wallets(0) ;

            }; // approve_money_transactions

            // reject incoming money transaction(s)
            self.reject_money_transactions = function (m) {
                var pgm = controller + '.reject_money_transactions: ' ;
                console.log(pgm + 'click. message = ' + JSON.stringify(m.message)) ;

                // reject process:
                // - send todo: reject money transactions chat message.
                // - if known wallet(s): let the wallets reject money transaction(s)

            }; // reject_money_transactions

            // edit incoming money transaction(s) - reject + new outgoing money transaction(s)
            self.edit_money_transactions = function (m) {
                var pgm = controller + '.edit_money_transactions: ' ;
                console.log(pgm + 'click. message = ' + JSON.stringify(m.message)) ;
            }; // edit_money_transactions

            var SESSION_INFO_KEY = moneyNetworkService.get_session_info_key();

            // show/update wallet balance in incoming money transaction(s)
            self.balance_money_transactions = function (m, balance_updated) {
                var pgm = controller + '.balance_money_transactions: ' ;
                console.log(pgm + 'click. message = ' + JSON.stringify(m.message)) ;

                moneyNetworkService.get_currencies({}, function (currencies, refresh_angular_ui) {
                    var pgm = controller + '.balance_money_transactions get_currencies callback: ';
                    var i, money_transaction, balances, amount, units, j, k, balance, now, elapsed_s, elapsed_text,
                        sessionid, sessionids, get_balance, ls_sessions;
                    if (!self.currencies) self.currencies = currencies; // initialize currencies array used in UI
                    now = new Date().getTime() ;

                    // lookup wallet balance for each money transaction
                    sessionids = [] ;
                    for (i=0 ; i<m.message.message.money_transactions.length ; i++) {
                        money_transaction = m.message.message.money_transactions[i] ;
                        // lookup balance
                        balances = [] ;
                        for (j=0 ; j<self.currencies.length ; j++) {
                            if (self.currencies[j].code != money_transaction.code) continue ;
                            if ([self.currencies[j].wallet_address, self.currencies[j].wallet_domain].indexOf(money_transaction.wallet_url) == -1) continue ;
                            // console.log(pgm + 'self.currencies[' + j + '] = ' + JSON.stringify(self.currencies[j])) ;
                            //self.currencies[0] = {
                            //    "code": "tBTC",
                            //    "amount": 3.69559209,
                            //    "last_request_at": 1513075990512,
                            //    "balance_at": 1512831462926,
                            //    "sessionid": "fvtqjprbarxpn65xxysixa8ahxua7niurc9wijmloiey5zbzgkn3acvwyezc",
                            //    "wallet_sha256": "593af9949006a3f1b27c00c10baec3719b2978b7d34224fa606f63ab167fe1de",
                            //    "wallet_address": "1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                            //    "wallet_title": "MoneyNetworkW2",
                            //    "wallet_description": "Money Network - Wallet 2 - BitCoins www.blocktrail.com - runner jro",
                            //    "api_url": "https://www.blocktrail.com/api/docs",
                            //    "unique_id": "593af9949006a3f1b27c00c10baec3719b2978b7d34224fa606f63ab167fe1de/tBTC",
                            //    "name": "Test Bitcoin",
                            //    "url": "https://en.bitcoin.it/wiki/Testnet",
                            //    "fee_info": "Fee is calculated by external API (btc.com) and subtracted from amount. Calculated from the last X block in block chain. Lowest fee that still had more than an 80% chance to be confirmed in the next block.",
                            //    "units": [{"unit": "BitCoin", "factor": 1}, {"unit": "Satoshi", "factor": 1e-8}],
                            //    "wallet_name": "MoneyNetworkW2",
                            //    "unique_text": "tBTC Test Bitcoin from MoneyNetworkW2"
                            //};
                            // console.log(pgm + 'money_transaction = ' + JSON.stringify(money_transaction)) ;
                            //money_transaction = {
                            //    "wallet_url": "1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                            //    "wallet_sha256": "593af9949006a3f1b27c00c10baec3719b2978b7d34224fa606f63ab167fe1de",
                            //    "wallet_name": "MoneyNetworkW2",
                            //    "action": "Send",
                            //    "code": "tBTC",
                            //    "name": "Test Bitcoin",
                            //    "amount": 0.00019002,
                            //    "money_transactionid": "EvKeyjEe5zMZ07Rd13tA57nloTXq2s5HdLohd5NPHVRuY78azzfmHiK1eOGS",
                            //    "json": {"return_address": "2MvaqsETdfWtbKQCPVun9Z32QACiek2ovAA"},
                            //    "$$hashKey": "object:1007"
                            //};
                            amount = self.currencies[j].amount ;
                            // units": [{"unit": "BitCoin", "factor": 1}, {"unit": "Satoshi", "factor": 1e-8}]
                            units = self.currencies[j].units ;
                            for (k=0 ; k<units.length ; k++) {
                                balance = amount / units[k].factor + ' ' + units[k].unit ;
                                if (units[k].factor == 1) balances.unshift(balance) ;
                                else balances.push(balance) ;
                            } // for j
                            elapsed_s = Math.round((now - self.currencies[j].balance_at) / 1000) ;
                            elapsed_text = shortChatTime(self.currencies[j].balance_at) ;
                            sessionid = self.currencies[j].sessionid ;
                            if ((elapsed_s > 120) && (sessionids.indexOf(sessionid) == -1)) sessionids.push(sessionid);
                        } // for k
                        if (balances.length) {
                            if (!money_transaction.message) money_transaction.message = {} ;
                            money_transaction.message.balance = 'Wallet balance ' + balances.join(' = ') ;
                            format_money_transaction_message(money_transaction) ;
                            console.log(pgm + money_transaction.message.html + ' last updated ' + elapsed_text) ;
                        }
                    } // for i
                    safeApply($scope) ;

                    if (balance_updated) {
                        // second call. wallet balance has already been updated
                        return ;
                    }

                    // update wallet balance.
                    ls_sessions = moneyNetworkService.ls_get_sessions() ;

                    get_balance = function() {
                        var pgm = controller + '.balance_money_transactions.get_balence: ';
                        var sessionid, mn_session_info ;
                        sessionid = sessionids.shift() ;
                        if (!sessionid) {
                            if (balance_updated) self.balance_money_transactions(m, true) ;
                            safeApply($scope) ;
                            return ;
                        }
                        mn_session_info = ls_sessions[sessionid] ? ls_sessions[sessionid][SESSION_INFO_KEY] : null;
                        if (!mn_session_info) {
                            console.log(pgm + 'error. could not find sessionid ' + sessionid + ' in lS sessions') ;
                            return get_balance() ;
                        }

                        // lookup sessionid in MoneyNetworkAPI sessions (encrypt = MoneyNetworkAPI instance)
                        MoneyNetworkAPILib.get_session(sessionid, function (api_session_info) {
                            var pgm = controller + '.balance_money_transactions.get_balence get_session callback 1: ';
                            var request ;
                            if (!api_session_info || !api_session_info.encrypt) {
                                // session lookup failed
                                console.log(pgm + 'error. could not find session info for sessionid ' + sessionid) ;
                                return get_balance() ;
                            }
                            // get balance
                            request = { msgtype: 'get_balance', open_wallet: true } ;
                            api_session_info.encrypt.send_message(request, {response: 30000}, function (response) {
                                var pgm = controller + '.balance_money_transactions.get_balence send_message callback 2: ';
                                var old_balance, new_balance ;
                                if (response && response.error && response.error.match(/^Timeout /)) {
                                    // OK. Timeout. Continue with next session
                                    return get_balance() ;
                                }
                                if (!response || response.error || (response.msgtype != 'balance')) {
                                    console.log(pgm + 'get_balance request failed. response = ' + JSON.stringify(response)) ;
                                    return get_balance() ;
                                }
                                // copy updated balance info into session_info
                                console.log(pgm + 'response = ' + JSON.stringify(response));
                                //response = {
                                //    "msgtype": "balance",
                                //    "balance": [{"code": "tBTC", "amount": 3.69539209}],
                                //    "balance_at": 1513158476645 == Wednesday, December 13, 2017 10:47:56 AM GMT+01:00
                                //};
                                console.log(pgm + 'mn_session_info = ' + JSON.stringify(mn_session_info)) ;
                                //mn_session_info = {
                                //    "url": "/1LqUnXPEgcS15UGwEgkbuTbKYZqAUwQ7L1",
                                //    "password": "U2FsdGVkX18VZhU0BdFeaei7S7b1RUJzNWQdpH2EbgrUYfjsR1AhYtGq+2LuP7EH7cRzhTdRL2DElaXVpGJ8geMfjfYTaBxNnw40Kwnb3JU=",
                                //    "pubkey": "-----BEGIN PUBLIC KEY-----\nMIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgHRyekzttFPmsyNG8Fz4fQTTXbtE\n1XsezBrWZkTl2afS1j+rxkPwg6+hhzwcJQXgI3WCG8oLpSFZFboJUYeKJVRAlOgq\n45Li5VnoRp1BrTbHzmCVNSbDLCwfnQIaPHC+B3FMKVCuqzQbWNzcjR8JtvzoHoWr\ndBcvINIznnD+PpfzAgMBAAE=\n-----END PUBLIC KEY-----",
                                //    "pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
                                //    "last_request_at": 1513158011723,
                                //    "done": {},
                                //    "wallet_sha256": "593af9949006a3f1b27c00c10baec3719b2978b7d34224fa606f63ab167fe1de",
                                //    "balance": [{"code": "tBTC", "amount": 3.69559209}],
                                //    "balance_at": 1512831462926 ==  Saturday, December 9, 2017 3:57:42 PM GMT+01:00
                                //};
                                if (mn_session_info.balance_at && (mn_session_info.balance_at >= request.balance_at)) {
                                    console.log(pgm + 'balance was not updated') ;
                                    return get_balance() ;
                                }
                                // update ls_sessions
                                mn_session_info.balance_at = response.balance_at ;
                                old_balance = JSON.parse(JSON.stringify(mn_session_info.balance)) ;
                                new_balance = response.balance ;
                                old_balance.sort(function (a,b) { return a.code < a.code ? -1 : 1 }) ;
                                new_balance.sort(function (a,b) { return a.code < a.code ? -1 : 1 }) ;
                                if (JSON.stringify(old_balance) != JSON.stringify(new_balance)) {
                                    mn_session_info.balance = response.balance ;
                                    balance_updated = true ;
                                }
                                moneyNetworkService.ls_save_sessions() ;

                            }) ; // send_message callback 2

                        }); // get_session callback 1
                    } ;
                    get_balance() ;

                }) ; // get_currencies callback

            }; // balance_money_transactions

            // public chat checkbox changed - add/remove public chat from UI
            self.public_chat_changed = function () {
                var pgm = controller + '.public_chat_changed: ' ;
                var i, contact, message, js_message_row, j ;
                moneyNetworkService.save_user_setup() ;
                MoneyNetworkHelper.load_user_setup(self.setup) ;
                if (!self.setup.public_chat) {
                    // public chat changed from true or false. remove already loaded public chat messages
                    for (i=0 ; i<self.contacts.length ; i++) {
                        contact = self.contacts[i] ;
                        for (j=contact.messages.length-1 ; j >= 0 ; j--) {
                            message = contact.messages[j] ;
                            if ((contact.type == 'public') || message.z_filename) {
                                js_message_row = moneyNetworkService.get_message_by_seq(message.seq);
                                moneyNetworkService.remove_message(js_message_row);
                            }
                        }
                    }
                }
                moneyNetworkService.clear_files_optional_cache() ;
                debug('infinite_scroll || public_chat', pgm + 'calling moneyNetworkService.reset_first_and_last_chat') ;
                moneyNetworkService.reset_first_and_last_chat();
                $timeout(check_public_chat, 100) ;
            };

            // long texts. remove max height and show more text link from message
            self.hide_overflow = function (message) {
                message.overflow = false ;
            };

            //// click message. show/hide comment and reaction icons
            //self.click_message = function (message) {
            //    var pgm = controller + '.click_message: ' ;
            //    message.show_feedback = !message.show_feedback ;
            //    console.log(pgm + 'show_feedback = ' + message.show_feedback) ;
            //}; // self.click_message

            // add/update reaction. update like.json (public reaction) or send a private reaction message to other user
            self.react = function (message, new_index) {
                var pgm = controller + '.react: ' ;
                var old_index, i, symbols, hex_codes, contact, unique_id ;
                // console.log(pgm + 'message = ' + JSON.stringify(message) + ', index = ' + new_index) ;
                if (!message.reactions) {
                    console.log(pgm + 'error. reactions array was not found for message. see moneyNetworkService.add_message') ;
                    // console.log(pgm + 'local_msg_seq = ' + message.message.local_msg_seq + ', no reactions array') ;
                    return ;
                }
                // check. private_reactions and public key (deleted contacts)
                // todo: add this check to messageReact directive (move code to moneyNetworkService)
                if (self.setup.private_reactions && (message.message.folder == 'inbox')) {
                    // must send reaction as a private message. Check that pubkey is available
                    if (message.contact.type == 'group') {
                        // ingoing group chat message. info about sender should be in message
                        //console.log(pgm + 'ingoing group chat message. contact.participants = ' + JSON.stringify(message.contact.participants) +
                        //    ', message.participant = ' + JSON.stringify(message.message.participant)) ;
                        unique_id = message.contact.participants[message.message.participant-1] ;
                        // console.log(pgm + 'unique_id = ' + unique_id) ;
                        contact = moneyNetworkService.get_contact_by_unique_id(unique_id) ;
                        // console.log(pgm + 'contact = ' + JSON.stringify(contact)) ;
                        if (!contact) {
                            console.log(pgm + 'error. contact (sender of group chat message) was not found') ;
                            return ;
                        }
                    }
                    else contact = message.contact ;
                    if (!contact.pubkey) {
                        console.log(pgm + 'cannot send private reaction message to contact without a public key') ;
                        return ;
                    }
                }
                // update selected reaction
                old_index = -1 ;
                for (i=0 ; i<message.reactions.length ; i++) {
                    if (message.reactions[i].selected) {
                        old_index = i ;
                        break ;
                    }
                }
                if (old_index != -1) delete message.reactions[old_index].selected ;
                if (new_index != old_index) message.reactions[new_index].selected = true ;
                // console.log(pgm + 'local_msg_seq = ' + message.message.local_msg_seq + ', old_index = ' + old_index + ', new_index = ' + new_index) ;

                // save reaction:
                // - public chat and !user_setup.private_reactions: update like.json file (reaction is public)
                // todo: UI - disable reaction if no contact public key and private reaction is selected
                // - otherwise send a private message with reaction. update reactions in localStorage
                if (message.reactions[new_index].selected) {
                    hex_codes = message.reactions[new_index].unicode.split('_') ;
                    symbols = [] ;
                    for (i=0 ; i<hex_codes.length ; i++) symbols.push(parseInt(hex_codes[i],16)) ;
                    message.message.reaction = punycode.ucs2.encode(symbols) ;
                }
                else delete message.message.reaction ;
                // save reaction. in like.json, in reactions in localStorage and/or send a private reaction message
                message.message.reaction_at = new Date().getTime();
                moneyNetworkService.ls_save_contacts(true); // true: update ZeroNet (update like.json or send a private reaction message)

            }; // react


            // get reactions. from like.json on zeroNet and reactions hash in localStorage
            self.get_reactions = function (message) {
                var pgm = controller + '.get_reactions: ' ;
                var check_reactions ;
                if (message.message.reactions) return message.message.reactions ;
                // console.log(pgm + 'local_msg_seq = ' + message.message.local_msg_seq) ;
                message.message.reactions = [] ;
                check_reactions = function () {
                    moneyNetworkService.check_reactions(message)
                } ;
                $timeout(check_reactions) ; // lookup reactions
                return message.message.reactions ;
            }; // get_reactions
            self.get_reactions_count = function (message) {
                var pgm = controller + '.get_reactions_count: ' ;
                var sum, i ;
                if (!message.message.reactions) return null ;
                if (!message.message.reactions.length) return null ;
                sum = 0 ;
                for (i=0 ; i<message.message.reactions.length ; i++) sum += message.message.reactions[i].count ;
                return sum ;
            }; // get_reactions_count

            
            // comments
            self.show_comment = function (message) {
                message.show_comment = !message.show_comment ;
            };
            self.create_comment = function (message) {
                var pgm = controller + '.create_comment: ' ;
                var contact, auth4, parent, unique_id, sender, comment, error, my_unique_id, message_with_envelope, i ;
                MoneyNetworkHelper.debug('outbox && unencrypted', 'message.comment = ' + message.comment + ', message.comment_src = ' + (message.comment_src ? true : false)) ;

                // create chat comment within the correct context.
                // a) public chat, group chat or privat chat
                // b) remember parent message id (timestamp + first 4 characters of auth_address)

                // check image attachment
                if (message.comment_src && !moneyNetworkService.get_image_ext_from_base64uri(message.comment_src)) {
                    z_wrapper_notification( ["error", "Ups. Something is wrong here.<br>" +
                        "Only png, jpg, jpeg, gif and tif images can be used in chat<br>" +
                        "Sending chat comment without image", 5000]);
                    message.comment_src='';
                }
                if (!message.comment && !message.comment_src) return ;

                // parent index. "<sent_at>,<auth4>". special unique id used for comments and reference to parent message
                if (message.message.folder == 'outbox') auth4 = ZeroFrame.site_info.auth_address.substr(0, 4) ;
                else if (message.contact.type != 'group') auth4 = message.contact.auth_address.substr(0,4) ; // public chat inbox or private chat inbox message from contact
                else {
                    // group chat inbox message. find sender from contact.participants and message.participant
                    unique_id = message.contact.participants[message.message.participant-1] ;
                    sender = get_contact_by_unique_id(unique_id) ;
                    console.log(pgm + 'parent index for group chat. message.participant = ' + message.message.participant +
                        ', contact.participants = ' + JSON.stringify(message.contact.participants) + ', unique_id = ' + unique_id + ', sender = ' + (sender ? true : false)) ;
                    if (sender) auth4 = sender.auth_address.substr(0,4) ;
                }
                if (auth4) parent = message.message.sent_at + ',' + auth4 ;
                if (!parent) {
                    console.log(pgm + 'error. could not create parent index for ' + JSON.stringify(message.message)) ;
                    return ;
                }

                // create comment
                comment = {
                    msgtype: 'chat msg',
                    message: message.comment || ' ',
                    image: message.comment_src,
                    parent: parent
                } ;
                if (!comment.image) delete comment.image ;
                // validate json
                error = MoneyNetworkHelper.validate_json(pgm, comment, comment.msgtype, 'Could not send chat message');
                if (error) {
                    z_wrapper_notification(["Error", error]);
                    console.log(pgm + 'comment = ' + JSON.stringify(comment)) ;
                    return;
                }
                MoneyNetworkHelper.debug('outbox && unencrypted', pgm + 'comment = ' + JSON.stringify(comment));
                // send message
                if (message.message.z_filename) contact = null ; // public chat
                else contact = message.contact ; // private or group chat
                moneyNetworkService.add_msg(contact, comment);
                if (contact && (contact.type == 'group') && comment.image) {
                    // sending a group chat message with an image.
                    // expects one receipt for each participant in chat group except me
                    // remove image chat message from zeronet (data.json) when all image receipts have been received
                    // see process_incoming_message - post processing of image receipts
                    // see z_update_data_json - data.json too big - xxxxxx
                    my_unique_id = moneyNetworkService.get_my_unique_id() ;
                    message_with_envelope = contact.messages[contact.messages.length-1] ;
                    message_with_envelope.image_receipts = [] ;
                    for (i=0 ; i<contact.participants.length ; i++) {
                        if (contact.participants[i] == my_unique_id) continue ;
                        message_with_envelope.image_receipts.push(contact.participants[i]) ;
                    }
                    debug('outbox && unencrypted', pgm + 'message_with_envelope = ' + JSON.stringify(message_with_envelope)) ;
                }

                // ready for next comment
                message.show_comment = false ;
                delete message.comment ;
                delete message.comment_src ;

                // sent/save new comment
                if (contact) contact.seen_at = new Date().getTime() ;
                moneyNetworkService.update_chat_notifications() ;
                moneyNetworkService.ls_save_contacts(true);
            }; // create_comment


            // infinite scroll
            // startup with infinite_scroll_limit = 5.
            // public_chat = false. No nothing after page startup
            // public_chat = true:
            // -
            // -
            // -

            self.get_more_messages = function () {
                var pgm = controller + '.get_more_messages: ' ;
                self.chat_page_context.infinite_scroll_limit = self.chat_page_context.infinite_scroll_limit + 5;
                debug('infinite_scroll', pgm + 'self.chat_page_context.infinite_scroll_limit = ' + self.chat_page_context.infinite_scroll_limit) ;
                debug('infinite_scroll || public_chat', pgm + 'calling moneyNetworkService.reset_first_and_last_chat') ;
                moneyNetworkService.reset_first_and_last_chat() ;
            }; // self.get_more_messages

            // ChatCtrl
        }])

;
