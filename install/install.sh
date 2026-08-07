#!/usr/bin/env bash
set -euo pipefail

APP=tiancode

MUTED='\033[0;2m'
RED='\033[0;31m'
ORANGE='\033[38;5;214m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

usage() {
    cat <<EOF
Tiancode Installer

Instala el CLI de Tiancode desde npm (@tiancode-ai/cli).

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    -v, --version <version> Instalar una versión específica (ej. 1.18.14)
        --no-modify-path    Don't modify shell config files (.zshrc, .bashrc, etc.)

Examples:
    curl -fsSL https://tiancode.vercel.app/install | bash
    curl -fsSL https://tiancode.vercel.app/install | bash -s -- --version 1.18.14
EOF
}

requested_version=${VERSION:-}
no_modify_path=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--version)
            if [[ -n "${2:-}" ]]; then
                requested_version="$2"
                shift 2
            else
                echo -e "${RED}Error: --version requires a version argument${NC}"
                exit 1
            fi
            ;;
        --no-modify-path)
            no_modify_path=true
            shift
            ;;
        *)
            echo -e "${ORANGE}Warning: Unknown option '$1'${NC}" >&2
            shift
            ;;
    esac
done

if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}Error: Node.js is required to install the Tiancode CLI.${NC}"
    echo -e "${MUTED}Install Node.js from https://nodejs.org and run this script again.${NC}"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1 && ! command -v bun >/dev/null 2>&1; then
    echo -e "${RED}Error: npm (or bun) is required to install the Tiancode CLI.${NC}"
    exit 1
fi

INSTALL_DIR=$HOME/.tiancode/bin
mkdir -p "$INSTALL_DIR"

npm_cmd=npm
if ! command -v npm >/dev/null 2>&1; then
    npm_cmd="bun x npm"
fi

version_spec="@latest"
if [ -n "$requested_version" ]; then
    version_spec="@${requested_version#v}"
fi

echo -e "${MUTED}Installing ${NC}${APP} ${MUTED}CLI${NC}${version_spec}${MUTED} via npm…${NC}"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

# Instala en un directorio local (no global) para no requerir permisos de
# administrador y dejar el binario dentro de las carpetas de Tiancode.
(
    cd "$tmp_dir"
    if [ "$npm_cmd" = "npm" ]; then
        npm install --no-audit --no-fund --prefix "$tmp_dir" "@tiancode-ai/cli${version_spec}" >/dev/null 2>&1
    else
        $npm_cmd install --no-audit --no-fund --prefix "$tmp_dir" "@tiancode-ai/cli${version_spec}" >/dev/null 2>&1
    fi
) || {
    echo -e "${RED}Error: no se pudo instalar @tiancode-ai/cli desde npm.${NC}"
    exit 1
}

cp "$tmp_dir/node_modules/@tiancode-ai/cli/bin/lildax.cjs" "$INSTALL_DIR/$APP"
chmod 755 "$INSTALL_DIR/$APP"

if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" == "true" ]; then
    echo "$INSTALL_DIR" >> "$GITHUB_PATH"
fi

add_to_path() {
    local config_file=$1
    local command=$2

    if grep -Fxq "$command" "$config_file"; then
        print_message info "Command already exists in $config_file, skipping write."
    elif [[ -w $config_file ]]; then
        echo -e "\n# tiancode" >> "$config_file"
        echo "$command" >> "$config_file"
        print_message info "${MUTED}Successfully added ${NC}${APP} ${MUTED}to \$PATH in ${NC}$config_file"
    else
        print_message warning "Manually add the directory to $config_file (or similar):"
        print_message info "  $command"
    fi
}

print_message() {
    local level=$1
    local message=$2
    local color=""

    case $level in
        info) color="${NC}" ;;
        warning) color="${NC}" ;;
        error) color="${RED}" ;;
    esac

    echo -e "${color}${message}${NC}"
}

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}

current_shell=$(basename "$SHELL")
case $current_shell in
    fish)
        config_files="$HOME/.config/fish/config.fish"
    ;;
    zsh)
        config_files="${ZDOTDIR:-$HOME}/.zshrc ${ZDOTDIR:-$HOME}/.zshenv $XDG_CONFIG_HOME/zsh/.zshrc $XDG_CONFIG_HOME/zsh/.zshenv"
    ;;
    bash)
        config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile"
    ;;
    ash|sh)
        config_files="$HOME/.ashrc $HOME/.profile /etc/profile"
    ;;
    *)
        config_files="$HOME/.bashrc $HOME/.bash_profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile"
    ;;
esac

if [[ "$no_modify_path" != "true" ]]; then
    config_file=""
    for file in $config_files; do
        if [[ -f $file ]]; then
            config_file=$file
            break
        fi
    done

    if [[ -z $config_file ]]; then
        print_message warning "No config file found for $current_shell. You may need to manually add to PATH:"
        print_message info "  export PATH=$INSTALL_DIR:\$PATH"
    elif [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        case $current_shell in
            fish)
                add_to_path "$config_file" "fish_add_path $INSTALL_DIR"
            ;;
            *)
                add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
            ;;
        esac
    fi
fi

if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" == "true" ]; then
    echo "$INSTALL_DIR" >> $GITHUB_PATH
fi

echo -e ""
echo -e "${GREEN}✓ Tiancode CLI instalado en $INSTALL_DIR/$APP${NC}"
echo -e ""
echo -e "${MUTED}Para empezar:${NC}"
echo -e ""
echo -e "cd <project>  ${MUTED}# Abre un directorio${NC}"
echo -e "tiancode      ${MUTED}# Ejecuta Tiancode${NC}"
echo -e ""
echo -e "${MUTED}Más información: ${NC}https://tiancode.vercel.app"
echo -e ""
