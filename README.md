# MoneyNetwork
Demo with complementary and alternative money. Implemented in ZeroFrame and AngularJS. Focus on privacy, encryption, max data on client and min data on server. 

Money is the force that permeates everything in our society. MoneyNetwork is a demo about money. With inspiration from Charles Eisenstein, Bernard Lietaer and others.

Our world has one serious error. Our current monetary system. Almost all problems on our planet is caused by this error.
This is an attempt to make money free. To change our world's operating system. To build a bridge between our present traditional monetary system and an ecosystem of complementary and alternative money systems. A monetary ecosystem will solve many of the problems the world are facing today.

The vision here is one app with easy access to any kind of money.
Use the money systems you like and not only our outdated dangerous money system.
Choose your money in the same way you choose clothes, food, housing, work, boyfriend, etc.
We are only free if we are free to choose money systems. No more time for bullshit. Be free.

Here is the demo. 

## Project status
Spare time project, work in progress, working on money integration. For now mostly a chat app on a very promising platform (ZeroNet). 

Implemented:
- End-2-end encryption. Data in localStorage and on ZeroNet is encrypted. Only search tags and public chat are stored in clear on ZeroNet. 
- Contact list: Categories: new, guest, unverified, verified and ignored.
- Chat: One and two panel chat, encrypted personal and group chat & unencrypted public chat, markdown, emojis, reactions and comments

Being implemented:
- MoneyNetworkAPI for MoneyNetwork <=> wallets and wallet <=> wallet communication
- Money: Send and request money in chat.  

Todo:
- Wallet or Money page: Test, add, use, rate and remove wallet sites.
- Wallet or Money page. Money transaction overview

## MoneyNetwork Demo
- http://127.0.0.1:43110/moneynetwork.bit/ ([ZeroNet](https://zeronet.readthedocs.io/en/latest/using_zeronet/installing/) required)
- https://www.zerogate.tk/moneynetwork.bit/
- https://fuckcf.cf/moneynetwork.bit/
- https://proxy.th3nd.com/moneynetwork.bit/
- https://proxy.zeronet.a0z.ru/moneynetwork.bit/
- https://zero.acelewis.com/#moneynetwork.bit/ (redirect to a "random" running ZeroNet proxy server) 

This demo should be safe to check out on a ZeroNet proxy server. 
You can see all ZeroNet sites on proxy servers but do not use your normal ZeroNet cert on a ZeroNet proxy server. An Anonymous moneynetwork.bit certificate can be used instead. And do not use real money on a proxy server.

## Wallets
- https://github.com/jaros1/Money-Network-W2 (test Bitcoins/Blocktrail API)

## API

Two layers API between MoneyNetwork and external money systems. MoneyNetwork <=> API1 <=> MoneyNetwork wallet sites <=> API2 <=> external money systems.

API1: Used inside ZeroNet only. See below.

API2: Used between Money Network wallet sites and external money systems.
Specific for each external API. For example https://www.blocktrail.com/api/docs that is a BitCoin API. See https://github.com/jaros1/Money-Network-W2/


API1 is at present time unstable. Json validation for in- and outgoing messages:

    // Json schemas for json validation of ingoing and outgoing MoneyNetworkAPI messages
    var json_schemas = {
        wallet: {},
        mn: {},
        api: {

            "pubkeys": {
                "type": 'object',
                "title": 'Send pubkeys (JSEncrypt and cryptMessage) to other session',
                "description": 'MoneyNetwork: sends unencrypted pubkeys message to Wallet without a session password. Wallet: returns an encrypted pubkeys message to MoneyNetwork including a session password. pubkey is public key from JSEncrypt. pubkey2 is public key from cryptMessage. Password used for session restore. See get_password and password messages',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^pubkeys$'},
                    "pubkey": {"type": 'string'},
                    "pubkey2": {"type": 'string'},
                    "password": {"type": 'string'}
                },
                "required": ['msgtype', 'pubkey', 'pubkey2'],
                "additionalProperties": false
            }, // pubkeys

            "save_data": {
                "type": 'object',
                "title": 'Wallet: Save encrypted wallet data in MoneyNetwork',
                "description": "Optional message. Can be used to save encrypted data in an {key:value} object in MoneyNetwork localStorage.",
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^save_data$'},
                    "data": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "key": {"type": 'string'},
                                "value": {"type": 'string'}
                            },
                            "required": ['key'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    }
                },
                "required": ['msgtype', 'data'],
                "additionalProperties": false
            }, // save_data

            "get_data": {
                "type": 'object',
                "title": 'Wallet: Get encrypted data from MoneyNetwork',
                "description": "Optional message. Can be used to request encrypted wallet data from MoneyNetwork localStorage",
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^get_data$'},
                    "keys": {
                        "type": 'array',
                        "items": {"type": 'string'},
                        "minItems": 1
                    }
                },
                "required": ['msgtype', 'keys'],
                "additionalProperties": false
            }, // get_data

            "data": {
                "type": 'object',
                "title": 'MoneyNetwork: get_data response to with requested encrypted wallet data',
                "description": "Optional message. Return requested encrypted data to wallet",
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^data$'},
                    "data": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "key": {"type": 'string'},
                                "value": {"type": 'string'}
                            },
                            "required": ['key'],
                            "additionalProperties": false
                        }
                    }
                }
            }, // data

            "delete_data": {
                "type": 'object',
                "title": 'Wallet: Delete encrypted data saved in MoneyNetwork',
                "description": "Optional message. Delete encrypted wallet data from MoneyNetwork localStorage. No keys property = delete all data",
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^delete_data$'},
                    "keys": {
                        "type": 'array',
                        "items": {"type": 'string'},
                        "minItems": 1
                    }
                },
                "required": ['msgtype'],
                "additionalProperties": false
            }, // delete_data

            "get_password": {
                "type": 'object',
                "title": 'Wallet: Restore old session. Request pwd2 from MN',
                "description": 'Pwd2 was sent to MN in first pubkeys message. Session restore. Unlock and return pwd2 to wallet session',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^get_password$'},
                    "pubkey": {"type": 'string'},
                    "pubkey2": {"type": 'string'},
                    "unlock_pwd2": {"type": 'string'}
                },
                "required": ["msgtype", "pubkey", "pubkey2", "unlock_pwd2"],
                "additionalProperties": false
            }, // get_password

            "password": {
                "type": 'object',
                "title": 'MN: Restore old session. Return unlocked password pwd2 to wallet session',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^password$'},
                    "password": {"type": 'string'}
                },
                "required": ["msgtype", "password"],
                "additionalProperties": false
            }, // password

            "response": {
                "type": 'object',
                "title": 'Generic response with an optional error message/code',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^response$'},
                    "error": {"type": 'string'}
                },
                "required": ['msgtype'],
                "additionalProperties": false
            }, // response

            "ping": {
                "type": 'object',
                "title": 'Simple session ping. Expects Timeout or OK response',
                "description": 'Permissions=true: request permissions info in ping response (open_wallet, request_balance etc)',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^ping$'},
                    "permissions": {"type": 'boolean'}
                },
                "required": ['msgtype'],
                "additionalProperties": false
            }, // ping

            "get_balance": {
                "type": 'object',
                "title": 'MN: send get_balance request to wallet session',
                "description": 'Wallet session must return a balance (OK) or response (error) message. Boolean flags: Open and/or close wallet before/after get_balance request',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^get_balance$'},
                    "open_wallet": {"type": 'boolean'},
                    "close_wallet": {"type": 'boolean'}
                },
                "required": ['msgtype'],
                "additionalProperties": false
            }, // get_balance

            "balance": {
                "type": 'object',
                "title": 'Wallet: response. return balance info to MN',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^balance$'},
                    "balance": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                "amount": {"type": 'number'}
                            },
                            "required": ['code', 'amount'],
                            "additionalProperties": false
                        }
                    },
                    "balance_at": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'balance', 'balance_at'],
                "additionalProperties": false
            }, // balance

            "wallet": {
                "type": 'object',
                "title": 'Public wallet information in wallet.json files',
                "description": 'wallet_* fields from site_info. currencies is a list of supported currencies, api_url is optional url to external API documentation and hub is a random wallet data hub address. wallet_sha256 is sha256 signature for {wallet_address, wallet_domain, wallet_title, wallet_description, currencies, api_url} hash',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^wallet$'},
                    "wallet_address": {"type": 'string'},
                    "wallet_domain": {"type": 'string'},
                    "wallet_title": {"type": 'string'},
                    "wallet_description": {"type": 'string'},
                    "currencies": {
                        "type": 'array',
                        "description": 'List of supported currencies. code is a (pseudo) currency iso code, short currency name, optional currency description (text), optional URL with currency information, optional fee information (text) and optional list with currency units',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                "name": {"type": 'string'},
                                "description": {"type": 'string'},
                                "url": {"type": 'string'},
                                "fee_info": {"type": 'string'},
                                "units": {
                                    "type": 'array',
                                    "description": 'Optional unit list. For example units: [{ unit: BitCoin, factor: 1 },{ unit: Satoshi, factor: 0.00000001 }]',
                                    "items": {
                                        "type": 'object',
                                        "properties": {
                                            "unit": {"type": 'string'},
                                            "factor": {"type": 'number'}
                                        },
                                        "required": ['unit', 'factor'],
                                        "additionalProperties": false
                                    },
                                    "minItems": 1
                                }
                            },
                            "required": ['code', 'name'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    },
                    "api_url": {"type": 'string'},
                    "wallet_sha256": {"type": 'string', "pattern": '^[0-9a-f]{64}$'},
                    "hub": {"type": 'string'}
                },
                "required": ['msgtype', 'wallet_sha256'],
                "additionalProperties": false
            }, // wallet

            // money transactions step 1: validate and optional return some json to be included in chat msg with money transactions. return prepare_mt_response or error response
            "prepare_mt_request": {
                "type": 'object',
                "title": 'Validate money transactions before send chat message with money transactions',
                "description": 'MN: validate money transactions in wallet session before send chat message to contact. Multiple money transactions are allowed. Money_transactionid. Wallet must return error message or json with transaction details for each money transaction',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^prepare_mt_request$'},
                    "contact": {
                        "description": 'Info about receiver of chat message / money transactions request. auth_address is the actual contact id and should be unique. alias and cert_user_id are human text info only and are not unique / secure contact info',
                        "type": 'object',
                        "properties": {
                            "alias": { "type": 'string'},
                            "cert_user_id": { "type": 'string'},
                            "auth_address": { "type": 'string'}
                        },
                        "required": ['alias', 'cert_user_id', 'auth_address'],
                        "additionalProperties": false
                    },
                    "open_wallet": {"type": 'boolean', "description": 'Open wallet before prepare_mt_request?'},
                    "close_wallet": {"type": 'boolean', "description": 'Close wallet after prepare_mt_request?'},
                    "money_transactions": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "action": { "type": 'string', "pattern": '^(Send|Request)$'},
                                "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                "amount": {"type": 'number'}
                            },
                            "required": ['action', 'code', 'amount'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    },
                    "money_transactionid": { "type": 'string', "minLength": 60, "maxLength": 60, "description": 'Transaction id or session id. Random string. Unique for this money transaction chat message. Shared between 2 MN sessions and 2 wallet sessions'}
                },
                "required": ['msgtype', 'contact', 'money_transactions', 'money_transactionid'],
                "additionalProperties": false
            }, // prepare_mt_request

            "prepare_mt_response": {
                "type": 'object',
                "title": 'prepare_mt_request response',
                "description": 'array with json to be included in chat message to contact. One json for each money transaction in prepare_mt_request',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^prepare_mt_response$'},
                    "jsons": {
                        "type": 'array',
                        "minItems": 1
                    }
                },
                "required": ['msgtype', 'jsons'],
                "additionalProperties": false
            }, // prepare_mt_response

            // money transaction step 2: tell wallet session that chat msg with money transactions has been sent to receiver
            "send_mt": {
                "type": 'object',
                "title": 'Send money transaction(s) to receiver',
                "description": 'MN: tell wallet session that money transactions chat message has been send to receiver. wallet must prepare for wallet to wallet communication',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^send_mt$'},
                    "money_transactionid": { "type": 'string', "minLength": 60, "maxLength": 60, "description": 'Same money_transactionid as in prepare_mt_request'}
                },
                "required": ['msgtype', 'money_transactionid'],
                "additionalProperties": false
            }, // send_mt

            // money transactions step 3: validate received money transactions. return OK response or error response
            "check_mt": {
                "type": 'object',
                "title": 'check money transactions received from contact in chat message',
                "description": 'See prepare_mt_request and prepare_mt_response for details.',
                "properties": {
                    "msgtype": { "type": 'string', "pattern": '^check_mt$'},
                    "contact": {
                        "description": 'Info about sender of chat message / money transactions request. auth_address is the actual contact id and should be unique. alias and cert_user_id are human text info only and are not unique / secure contact info',
                        "type": 'object',
                        "properties": {
                            "alias": { "type": 'string'},
                            "cert_user_id": { "type": 'string'},
                            "auth_address": { "type": 'string'}
                        },
                        "required": ['alias', 'cert_user_id', 'auth_address'],
                        "additionalProperties": false
                    },
                    "open_wallet": {"type": 'boolean'},
                    "close_wallet": {"type": 'boolean'},
                    "money_transactions": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "action": { "type": 'string', "pattern": '^(Send|Request)$'},
                                "code": {"type": 'string', "minLength": 2, "maxLength": 5},
                                "amount": {"type": 'number'},
                                "json": {}
                            },
                            "required": ['action', 'code', 'amount', 'json'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    },
                    "money_transactionid": { "type": 'string', "minLength": 60, "maxLength": 60, "description": 'Same money_transactionid as in prepare_mt_request and send_mt'}
                },
                "required": ['msgtype', 'contact', 'money_transactions', 'money_transactionid'],
                "additionalProperties": false
            }, // check_mt

            // money transactions step 4: all validation OK. start actual money transaction(s) (wallet to wallet)
            "start_mt": {
                "type": 'object',
                "title": 'Start money transaction(s)',
                "description": 'MN: tell wallet session(s) to execute money transactions received in check_mt request',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^start_mt$'},
                    "money_transactionid": { "type": 'string', "minLength": 60, "maxLength": 60, "description": 'Same money_transactionid as in check_mt_request'}
                },
                "required": ['msgtype', 'money_transactionid'],
                "additionalProperties": false
            }, // start_mt

            // publish sync. between MN and wallet sessions. minimum interval between publish is 16 seconds. MN session manages publish queue.
            "queue_publish": {
                "type": 'object',
                "title": 'Wallet: Ask MoneyNetwork to add publish request in publish queue',
                "description": 'Wallet session places cb in queue and sends unique cb_id to MoneyNetwork. Short timeout (5 seconds). Wallet session expects OK or timeout. Timeout: continue with publish. OK: wait for start_publish message',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^queue_publish$'},
                    "cb_id": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'cb_id'],
                "additionalProperties": false
            }, // publish_started

            "start_publish": {
                "type": 'object',
                "title": 'MoneyNetwork: Tell wallet session to start publish',
                "description": 'Use cb_id to force a new publish. Ratelimit error in last wallet publish',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^start_publish$'},
                    "cb_id": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'cb_id'],
                "additionalProperties": false
            }, // start_published

            "check_publish": {
                "type": 'object',
                "title": 'MoneyNetwork. Asking wallet if publish started with start_publish is still running',
                "description": 'For example after 30 seconds wait. Maybe a lost message or a JS error has prevented wallet session from reporting back to MoneyNetwork',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^check_publish$'},
                    "cb_id": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'cb_id'],
                "additionalProperties": false
            }, // check_publish

            "published": {
                "type": 'object',
                "title": 'Wallet: publish done. Send publish result and timestamp for last OK publish to MN',
                "description": 'get_publish_response. Also used after OK or failed publish',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^published$'},
                    "cb_id": {"type": "number", "multipleOf": 1.0},
                    "res": {"type": 'string'},
                    "last_published_at": {"type": "number", "multipleOf": 1.0}
                },
                "required": ['msgtype', 'cb_id', 'res', 'last_published_at'],
                "additionalProperties": false

            }, // published

            "notification" : {
                "type": 'object',
                "title": 'MN/Wallet. Send notification, see wrapperNotification, to other session',
                "description": 'For example: wallet session is waiting for user confirmation (money transfer)',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^notification$'},
                    "type": { "type": 'string', "pattern": '^(info|error|done)$'},
                    "message": { "type": 'string'},
                    "timeout": { "type": 'number'}
                },
                "required": ['msgtype', 'type'],
                "additionalProperties": false
            }, // notification

            "timeout": {
                "type": 'object',
                "title": 'MN/Wallet. Timeout message with notification and old processing information',
                "description": 'Sending process must adjust timeout in requests to avoid timeout',
                "properties": {
                    "msgtype": {"type": 'string', "pattern": '^timeout$'},
                    "notification": {
                        "type": 'object',
                        "properties": {
                            "type": { "type": 'string'},
                            "message": { "type": 'string'},
                            "timeout": { "type": 'number'}
                        },
                        "required": ['msgtype', 'message'],
                        "additionalProperties": false
                    },
                    "stat": {
                        "type": 'array',
                        "items": {
                            "type": 'object',
                            "properties": {
                                "filename": { "type": 'string'},
                                "msgtype": {"type": 'string'},
                                "start_at": {"type": 'number', "multipleOf": 1.0},
                                "finish_at": {"type": 'number', "multipleOf": 1.0}
                            },
                            "required": ['filename', 'msgtype', 'start_at', 'finish_at'],
                            "additionalProperties": false
                        },
                        "minItems": 1
                    }
                },
                "required": ['msgtype', 'stat'],
                "additionalProperties": false
            } // timeout

        } // api

    } ; // json_schemas


## Software 
- html5, ccs3, javascript and some sql. Simple code, lots of comments and code should be "easy"" to follow. 
- [AngularJS v1.5.8](https://angularjs.org/) (very well documented).
- [ZeroNet 5.0](https://zeronet.readthedocs.io/en/latest/site_development/zeroframe_api_reference/) (documentation could be better).
- Method: Test dreven development. No testing framework. Just manual testing.

## Help
Test help would by nice. Create an issue if you find something that should be fixed.
Money help would by nice. Feel free to contact me if you have spare money for this project. 

