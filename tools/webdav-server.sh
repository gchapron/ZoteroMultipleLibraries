#!/bin/bash
#
# Local WebDAV server for testing per-library file sync, using the Apache
# httpd + mod_dav that ship with macOS. Nothing is installed; it runs as the
# current user on 127.0.0.1 only.
#
# Usage:
#   tools/webdav-server.sh start    # http://127.0.0.1:8089/  (user zml, password zml-test-password)
#   tools/webdav-server.sh stop
#   tools/webdav-server.sh status
#
# Files land in tools/.test/webdav/data/. The credentials are throwaway test
# values that exist only for this local server.
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${ZML_WEBDAV_DIR:-$ROOT/tools/.test/webdav}"
PORT="${ZML_WEBDAV_PORT:-8089}"
USER_NAME="zml"
PASSWORD="zml-test-password"
HTTPD="${HTTPD_BIN:-/usr/sbin/httpd}"
MODULES="/usr/libexec/apache2"
CONF="$BASE/httpd.conf"
PID="$BASE/httpd.pid"

status() {
	if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then
		echo "running (pid $(cat "$PID")) on http://127.0.0.1:$PORT/"
		return 0
	fi
	echo "not running"
	return 1
}

case "${1:-}" in
	status)
		status
		;;
	stop)
		if [ -f "$PID" ]; then
			"$HTTPD" -f "$CONF" -k stop 2>/dev/null || kill "$(cat "$PID")" 2>/dev/null || true
			sleep 1
		fi
		echo "stopped"
		;;
	start)
		if status >/dev/null 2>&1; then
			status
			exit 0
		fi
		mkdir -p "$BASE/data" "$BASE/logs" "$BASE/lock"
		/usr/sbin/htpasswd -b -c "$BASE/htpasswd" "$USER_NAME" "$PASSWORD" >/dev/null 2>&1
		cat > "$CONF" <<CONF
ServerRoot "$BASE"
ServerName 127.0.0.1
Listen 127.0.0.1:$PORT
PidFile "$PID"
ErrorLog "$BASE/logs/error.log"
LogLevel info
LoadModule mpm_prefork_module $MODULES/mod_mpm_prefork.so
LoadModule unixd_module $MODULES/mod_unixd.so
LoadModule authn_core_module $MODULES/mod_authn_core.so
LoadModule authn_file_module $MODULES/mod_authn_file.so
LoadModule authz_core_module $MODULES/mod_authz_core.so
LoadModule authz_user_module $MODULES/mod_authz_user.so
LoadModule auth_basic_module $MODULES/mod_auth_basic.so
LoadModule mime_module $MODULES/mod_mime.so
LoadModule log_config_module $MODULES/mod_log_config.so
LoadModule setenvif_module $MODULES/mod_setenvif.so
LoadModule dav_module $MODULES/mod_dav.so
LoadModule dav_fs_module $MODULES/mod_dav_fs.so
LoadModule dav_lock_module $MODULES/mod_dav_lock.so
TypesConfig /private/etc/apache2/mime.types
DavLockDB "$BASE/lock/DavLock"
LogFormat "%h %t \"%r\" %>s %b" common
CustomLog "$BASE/logs/access.log" common
DocumentRoot "$BASE/data"
<Directory "$BASE/data">
    Dav On
    AuthType Basic
    AuthName "ZML test WebDAV"
    AuthUserFile "$BASE/htpasswd"
    Require valid-user
</Directory>
CONF
		"$HTTPD" -f "$CONF" -k start
		for _ in $(seq 1 20); do
			if curl -s -o /dev/null -u "$USER_NAME:$PASSWORD" "http://127.0.0.1:$PORT/"; then
				status
				exit 0
			fi
			sleep 0.5
		done
		echo "server did not come up; see $BASE/logs/error.log" >&2
		exit 1
		;;
	*)
		echo "usage: $0 start|stop|status" >&2
		exit 1
		;;
esac
