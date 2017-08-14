angular.module('MoneyNetwork')

    .controller('WalletCtrl', ['$rootScope', '$window', '$location', '$timeout', 'MoneyNetworkService', 'MoneyNetworkHubService', 'MoneyNetworkWService',
                     function ($rootScope, $window, $location, $timeout, moneyNetworkService, moneyNetworkHubService, moneyNetworkWService)
    {
        var self = this;
        var controller = 'WalletCtrl';
        if (!MoneyNetworkHelper.getItem('userid')) {
            // not logged in - skip initialization of controller
            return;
        }
        console.log(controller + ' loaded');

        var BITCOIN_ADDRESS_PATTERN = '1[a-km-zA-HJ-NP-Z1-9]{25,34}' ;

        // create new sessionid for MoneyNetwork and MoneyNetwork wallet communication
        // sessionid: a "secret" sessionid URL parameter used when opening MoneyNetwork wallet site (only a secret when running ZeroNet local)
        // no event file done for "internal" cross site communication. dbQuery fetching will be used to detect new messages
        // using optional files and siteSign. sitePublish is not needed for "internal" cross site communication
        // message filenames:
        // - my messages: sha256.first(10).timestamp
        // - wallet messages: sha256.last(10).timestamp
        var encrypt2 ;
        function new_sessionid () {
            var pgm = controller + '.new_sessionid: ' ;
            test_sessionid = MoneyNetworkHelper.generate_random_password(60, true).toLowerCase();
            // monitor incoming messages from this new wallet session
            encrypt2 = new MoneyNetworkAPI({
                sessionid: test_sessionid,
                prvkey: MoneyNetworkHelper.getItem('prvkey'), // for JSEncrypt (decrypt incoming message)
                userid2: MoneyNetworkHelper.getUserId(), // for cryptMessage (decrypt incoming message)
                debug: true
            }) ;
        } // new_sessionid

        var SESSION_INFO_KEY = moneyNetworkWService.get_session_info_key() ;

        // get old sessions from ls
        var ls_sessions = moneyNetworkWService.ls_get_sessions() ;

        self.new_wallet_url = $location.search()['new_wallet_site'] ; // redirect from a MoneyNetwork wallet site?
        var tested_wallet_url = null ; // last tested url
        var test_sessionid ;
        var test_session_at = null ;
        new_sessionid () ;

        function get_relative_url (url) {
            var pgm = controller + '.get_relative_url: ' ;
            var pos ;
            pos = url.indexOf('://') ;
            if (pos != -1) {
                // remove protocol (http, https etc)
                url = url.substr(pos+3) ;
                pos = url.indexOf('/') ;
                // remove domain from url (127.0.0.1 or proxy server)
                if (pos == -1) return null ; // cannot be a ZeroNet site URL
                url = url.substr(pos) ;
                return url ;
            }
            if (url.substr(0,1) == '/') return url ; // already a relative url ...
            if (url.match(new RegExp('^' + BITCOIN_ADDRESS_PATTERN + '$'))) return '/' + url ; // bitcoin address
            if (url.match(new RegExp('^' + BITCOIN_ADDRESS_PATTERN + '\/'))) return '/' + url ; // bitcoin address
            if (url.match(/\.bit$/)) return '/' + url ; // .bit domain
            if (url.match(/\.bit\//)) return '/' + url ; // .bit domain
            return null ;
        } // get_relative_url

        // https://stackoverflow.com/a/10997390/11236
        // https://stackoverflow.com/questions/1090948/change-url-parameters
        function updateURLParameter(url, param, paramVal){
            var newAdditionalURL = "";
            var tempArray = url.split("?");
            var baseURL = tempArray[0];
            var additionalURL = tempArray[1];
            var temp = "";
            if (additionalURL) {
                tempArray = additionalURL.split("&");
                for (var i=0; i<tempArray.length; i++){
                    if(tempArray[i].split('=')[0] != param){
                        newAdditionalURL += temp + tempArray[i];
                        temp = "&";
                    }
                }
            }
            var rows_txt = temp + "" + param + "=" + paramVal;
            return baseURL + "?" + newAdditionalURL + rows_txt;
        }

        self.show_test_new_wallet = function(context) {
            var pgm = controller + '.show_test_new_wallet: ' ;
            var show, relative_url ;
            if (!self.new_wallet_url) return false ;
            relative_url = get_relative_url(self.new_wallet_url) ;
            show = relative_url ? true : false ;
            //console.log(pgm + 'context = ' + context + ', show = ' + show + ', relative_url = ' + relative_url) ;
            return show ;
        };
        self.test_new_wallet = function() {
            var pgm = controller + '.test_new_wallet: ' ;
            if (!self.new_wallet_url) {
                ZeroFrame.cmd("wrapperNotification", ['error', 'Please enter new wallet URL', 5000]);
                return ;
            }
            tested_wallet_url = self.new_wallet_url ;
            run_tests() ;
        };
        self.reset_test = function () {
            var i ;
            // stop any running tests
            for (i=0 ; i<self.tests.length ; i++) {
                if (self.tests[i].info.text == 'Running') {
                    self.tests[i].info.test_failed = true ;
                    self.test_feedback(self.tests[i], 'failed') ;
                }
            }
            // test stopped
            self.test_running = false ;
            // reset test array
            init_tests() ;
            for (i=0 ; i<self.tests.length ; i++) {
                self.tests[i].info.status = 'Pending' ;
                delete self.tests[i].info.test_skipped ;
                delete self.tests[i].info.test_ok ;
                delete self.tests[i].info.test_failed ;
                delete self.tests[i].info.disabled ;
            }
            // new sessionid
            new_sessionid() ;
        };
        var test1_open_url = (function () {
            var pgm = controller + '.test1: ' ;
            var info = {
                no: 1,
                text: 'Open wallet URL',
                status: 'Pending'
            };
            function run() {
                var pgm = controller + '.test1.run: ' ;
                var url, request ;
                if (['Test skipped', 'Test OK'].indexOf(info.status) != -1) {
                    // continue with next test
                    console.log(pgm + 'test ' + info.no + ' done. start test ' + (info.no + 1));
                    info.disabled = true;
                    test2_allow_popup.run();
                }
                else {
                    // start test 1. add sessionid to URL and open new window with wallet session
                    // sessionid: "secret" sessionid random 60 character password
                    // SHA256(sessionid).first(10).<timestamp>: MoneyNetwork session filename (optional file). this session
                    // SHA256(sessionid).last(10).<timestamp>: MoneyNetwork wallet session filename (optional file). other session
                    info.status = 'Running' ;
                    url = get_relative_url(self.new_wallet_url) ;
                    url = updateURLParameter(url, 'sessionid', test_sessionid) ;
                    console.log(pgm + 'url = ' + url) ;
                    ZeroFrame.cmd("wrapperOpenWindow", [url, "_blank"]);

                    // send unencrypted pubkeys message to wallet session. Do not wait for any response.
                    // encrypted pubkeys response will be processed by process_incoming_message callback function
                    request = {
                        msgtype: 'pubkeys',
                        pubkey: MoneyNetworkHelper.getItem('pubkey'), // for JSEncrypt
                        pubkey2: MoneyNetworkHelper.getItem('pubkey2') // for cryptMessage
                    } ;
                    test_session_at = new Date().getTime() ;
                    encrypt2.send_message(request, {encryptions:[]}, function (response) {
                        var pgm = controller + '.test1.run send_message callback 2: ' ;
                        console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                    }) ;

                } // if else
            } // run
            return {
                info: info,
                run: run
            };
        })(); // test1

        var test2_allow_popup = (function () {
            var pgm = controller + '.test2: ' ;
            var info = {
                no: 2,
                text: 'Popup allowed in browser',
                status: 'Pending'
            };
            function run () {
                if (['Test skipped', 'Test OK'].indexOf(info.status) != -1) {
                    // continue with next test
                    console.log(pgm + 'test ' + info.no + ' done. start test ' + (info.no+1)) ;
                    info.disabled = true ;
                    test3_select_zeroid.run() ;
                }
                else {
                    // start test 2
                    info.status = 'Running' ;
                    ZeroFrame.cmd("wrapperConfirm", [info.text + '?'], function (ok) {
                        if (!ok) return ;
                        info.test_ok = true ;
                        self.test_feedback(test2_allow_popup, 'OK') ;
                        $rootScope.$apply() ;
                    }) ;
                }
            }
            return {
                info: info,
                run: run
            };
        })(); // test2

        var test3_select_zeroid = (function () {
            var pgm = controller + '.test3: ' ;
            var info = {
                no: 3,
                text: 'ZeroID selected in wallet',
                status: 'Pending'
            };
            function run () {
                if (['Test skipped', 'Test OK'].indexOf(info.status) != -1) {
                    // continue with next test
                    console.log(pgm + 'test ' + info.no + ' done. start test ' + (info.no+1)) ;
                    info.disabled = true ;
                    test4_merger_moneynetwork.run() ;
                }
                else {
                    // start test 3
                    info.status = 'Running' ;
                    ZeroFrame.cmd('wrapperNotification', ['info', 'Please check that "ZeroId" is selected in wallet and click Test OK', 5000]);
                }
            }
            return {
                info: info,
                run: run
            };
        })(); // test3

        var test4_merger_moneynetwork = (function () {
            var pgm = controller + '.test4: ' ;
            var info = {
                no: 4,
                text: 'Merger:MoneyNetwork permission granted in wallet',
                status: 'Pending'
            };
            function run () {
                if (['Test skipped', 'Test OK'].indexOf(info.status) != -1) {
                    // continue with next test
                    console.log(pgm + 'test ' + info.no + ' done. start test ' + (info.no+1)) ;
                    info.disabled = true ;
                    test5_check_session.run() ;
                }
                else {
                    // start test 4
                    info.status = 'Running' ;
                    ZeroFrame.cmd('wrapperNotification', ['info', 'Please check that "Merger:MoneyNetwork permission" is granted in wallet and click Test OK', 5000]);
                }
            }
            return {
                info: info,
                run: run
            };
        })(); // test4

        var test5_check_session = (function () {
            var pgm = controller + '.test5: ' ;
            var info = {
                no: 5,
                text: 'Checking session',
                status: 'Pending'
            };
            function run () {
                if (['Test skipped', 'Test OK'].indexOf(info.status) != -1) {
                    // test done
                    info.disabled = true ;
                    self.test_running = false ;
                }
                else {
                    // start test 5. wait for wallet feedback (pubkeys message)
                    info.status = 'Running' ;

                    // wait for session to start. expects a pubkeys message from MoneyNetwork wallet session
                    // incoming messages are received by MoneyNetworkAPI.demon process in process_incoming_message callback
                    // wait for pubkeys information to be inserted into sessions hash. wait max 1 minute
                    var check_session = function(cb, count) {
                        var job ;
                        if (!count) count = 0;
                        if (count > 60) return cb({ error: "timeout" }) ;
                        if (!ls_sessions[test_sessionid] || !ls_sessions[test_sessionid][SESSION_INFO_KEY]) {
                            // wait. pubkeys message not yet received
                            job = function () { check_session(cb, count+1) };
                            $timeout(job, 1000) ;
                            return ;
                        }
                        // done. pubkeys message from wallet session was received by process_incoming_message callback
                        cb(ls_sessions[test_sessionid][SESSION_INFO_KEY]) ;
                    }; // check_session

                    // start session check. should wait for max 60 seconds for session handshake
                    check_session(function (res) {
                        var elapsed ;
                        if (res.error) {
                            console.log(pgm + 'wallet session was not found. error = ' + res.error) ;
                            info.status = 'Test failed' ;
                            info.disabled = true ;
                            self.test_running = false ;
                        }
                        else {
                            elapsed = res.session_at - test_session_at ;
                            console.log(pgm + 'new wallet session was found. pubkey2 = ' + res.pubkey2 + ', waited ' + Math.round(elapsed / 1000) + ' seconds') ;
                            info.status = 'Test OK' ;
                            info.disabled = true ;
                            self.test_running = false ;
                        }
                        console.log(pgm + 'check_session. res = ' + JSON.stringify(res)) ;
                        //res = {
                        //    "msgtype": "pubkeys",
                        //    "pubkey": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCIsVzGN462DlwPYxJ+ZvLKWxIL\ndEYLhjMOrwRA91yd/9toIlBMjGy4wEvYgSn2bZKcymiCOHBl63Zx8o7XDBrM+v4e\nl6iHVeGPyui+vYneCY+4dez+DJeZFyAGvYuELXaEJCCmeXItQdpZgZZC9Kx7QmrB\nXA2/72e63uKPI47gfQIDAQAB\n-----END PUBLIC KEY-----",
                        //    "pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R"
                        //};
                        //$rootScope.$apply();
                    }) ; // check_session callback
                } // end if else
            } // run
            return {
                info: info,
                run: run
            };
        })(); // test5

        self.tests = [] ;
        function init_tests () {
            self.tests.splice(0, self.tests.length) ;
            self.tests.push(test1_open_url) ;
            self.tests.push(test2_allow_popup) ;
            self.tests.push(test3_select_zeroid) ;
            self.tests.push(test4_merger_moneynetwork) ;
            self.tests.push(test5_check_session) ;
        }
        init_tests();
        self.test_running = false ;

        function run_tests() {
            self.test_running = true ;
            self.tests[0].run() ;
        } // run_tests

        self.test_feedback = function (test, checkbox) {
            var checked ;
            if (checkbox=='skipped') checked = test.info.test_skipped ;
            if (checkbox=='OK') checked = test.info.test_ok ;
            if (checkbox=='failed') checked = test.info.test_failed ;

            // checkbox feedback (skip, ok or failed)
            if (checked) {
                // check
                test.info.old_status = test.info.status ; // save system status
                test.info.status = 'Test ' + checkbox ;
                if (checkbox == 'skipped') {
                    test.info.test_ok = false ;
                    test.info.test_failed = false ;
                    if (test.info.old_status == 'Running') test.run() ; // next test
                }
                if (checkbox == 'OK') {
                    test.info.test_skipped = false ;
                    test.info.test_failed = false ;
                    if (test.info.old_status == 'Running') test.run() ; // next test
                }
                if (checkbox == 'failed') {
                    test.info.test_skipped = false ;
                    test.info.test_ok = false ;
                }
            }
            else {
                // uncheck
                test.info.status = test.info.old_status ; // restore system status
                delete test.info.old_status ;
            }
        };

        self.show_add_new_wallet = function() {
            return (self.new_wallet_url && (self.new_wallet_url == tested_wallet_url)) ;

        };
        self.add_new_wallet = function () {
            var pgm = controller + '.add_new_wallet: ' ;
            console.log(pgm + 'new wallet url = ' + self.new_wallet_url) ;
        };

        // end WalletCtrl
    }])

;