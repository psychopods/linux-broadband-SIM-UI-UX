%define debug_package %{nil}

Name:           sim-broadband-manager
Version:        %{?ver}%{!?ver:3.0.0}
Release:        1%{?dist}
Summary:        SIM Broadband Manager for modem status and network control

License:        GPLv3+
URL:            https://github.com/psychopods/linux-broadband-SIM-UI-UX
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  gcc-c++
BuildRequires:  openssl-devel
BuildRequires:  pkgconfig
BuildRequires:  gtk3-devel
BuildRequires:  webkit2gtk4.1-devel
BuildRequires:  libsoup3-devel
BuildRequires:  glib2-devel
BuildRequires:  javascriptcoregtk4.1-devel

Requires:       gtk3
Requires:       webkit2gtk4.1
Requires:       libsoup3
Requires:       ModemManager
Requires:       NetworkManager

%description
Desktop application to manage broadband SIM modems, monitor connectivity,
send SMS/USSD, make calls, and access SIM phonebook contacts using ModemManager.

%prep
%setup -q

%build
# We build the rust binary here inside the RPM setup
cd sim/src-tauri
cargo build --release

%install
mkdir -p %{buildroot}%{_bindir}
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/128x128/apps

cp sim/src-tauri/target/release/sim %{buildroot}%{_bindir}/sim-broadband-manager
cp sim-broadband-manager.desktop %{buildroot}%{_datadir}/applications/
cp icons/128x128.png %{buildroot}%{_datadir}/icons/hicolor/128x128/apps/com.github.psychopods.sim_broadband_manager.png

%files
%{_bindir}/sim-broadband-manager
%{_datadir}/applications/sim-broadband-manager.desktop
%{_datadir}/icons/hicolor/128x128/apps/com.github.psychopods.sim_broadband_manager.png
