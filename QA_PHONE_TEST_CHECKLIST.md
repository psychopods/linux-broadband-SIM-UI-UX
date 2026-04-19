# SIM Voice Calling QA Run Sheet

Project: linux-broadband-SIM-UI-UX  
Build: ____________________  
Tester: ____________________  
Date: ____________________  
Target Laptop Model: ____________________  
Modem Model/Firmware: ____________________  
SIM Operator: ____________________

## Environment Checks

- [ ] Modem detected by OS
- [ ] ModemManager running
- [ ] SIM inserted and recognized
- [ ] App launches successfully
- [ ] No startup crash in logs

Evidence:

- mmcli -L: ____________________
- mmcli -m 0 (summary): ____________________

---

## Capability State Validation

### 1. Voice Unsupported

- [ ] Phone sidebar button hidden
- [ ] No callable phone controls visible
- [ ] App remains stable

Result: [ ] PASS  [ ] FAIL

### 2. Voice Supported (Normal)

- [ ] Phone sidebar button visible
- [ ] Phone tab opens
- [ ] Status indicates ready when idle

Result: [ ] PASS  [ ] FAIL

### 3. Voice Supported (Emergency-only, if applicable)

- [ ] Phone visible
- [ ] Capability text indicates emergency-only
- [ ] Non-emergency dialing is rejected gracefully

Result: [ ] PASS  [ ] FAIL / [ ] N/A

---

## Functional Test Cases

### 1. TC-01 Startup Capability Detection

- [ ] UI capability state matches modem capability

Result: [ ] PASS  [ ] FAIL

### 2. TC-02 Tab Gating

- [ ] Unsupported device cannot open Phone tab
- [ ] Supported device can open Phone tab
- [ ] Switching tabs hides others correctly

Result: [ ] PASS  [ ] FAIL

### 3. TC-03 Idle Phone Status

- [ ] "No active call" shown when idle
- [ ] Status pill is correct for idle state

Result: [ ] PASS  [ ] FAIL

### 4. TC-04 Outgoing Call

- [ ] Call button starts dialing
- [ ] State transitions visible (dialing/ringing/active)
- [ ] No freeze/crash

Result: [ ] PASS  [ ] FAIL

### 5. TC-05 Incoming Call + Answer

- [ ] Incoming state detected
- [ ] Answer works
- [ ] Active state shown after answer

Result: [ ] PASS  [ ] FAIL

### 6. TC-06 Hang Up

- [ ] Hangup ends call
- [ ] UI returns to idle-ready
- [ ] No stale active-call state

Result: [ ] PASS  [ ] FAIL

### 7. TC-07 DTMF During Active Call

- [ ] Valid tones accepted
- [ ] UI remains stable
- [ ] No call-state corruption

Result: [ ] PASS  [ ] FAIL

### 8. TC-08 Input Validation

- [ ] Empty number rejected cleanly
- [ ] Invalid number chars rejected
- [ ] Invalid DTMF rejected

Result: [ ] PASS  [ ] FAIL

### 9. TC-09 Modem Disconnect During Runtime

- [ ] UI degrades gracefully
- [ ] No app crash
- [ ] Capability/status update correctly

Result: [ ] PASS  [ ] FAIL

### 10. TC-10 Modem Reconnect Recovery

- [ ] UI recovers without app restart
- [ ] Capability/status re-hydrate correctly

Result: [ ] PASS  [ ] FAIL

### 11. TC-11 Audio Route Visibility

- [ ] Audio port displayed if exposed
- [ ] Audio format displayed if exposed
- [ ] If not exposed, feedback clearly states limitation

Result: [ ] PASS  [ ] FAIL

---

## Non-Functional Checks

- [ ] No blocking UI lag while polling
- [ ] Error messages are clear and actionable
- [ ] No repeated false errors on cancel/hangup
- [ ] App remains responsive after 10+ minutes usage

Result: [ ] PASS  [ ] FAIL

---

## Overall Release Decision

- [ ] PASS FOR TARGET LAPTOP
- [ ] FAIL (fixes required)

Blocking defects:

1. ______________________________________
2. ______________________________________
3. ______________________________________

Notes:

________________________________________  
________________________________________  
________________________________________
