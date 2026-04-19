use sim_broadband_gui::{get_sim_contacts, get_sim_management};

#[tokio::main]
async fn main() {
    match get_sim_management().await {
        Ok(sim) => {
            println!("SIM state: present={}, pin_lock_state={}, unlock_required={}", sim.present, sim.pin_lock_state, sim.unlock_required);
        }
        Err(error) => {
            eprintln!("SIM management fetch failed: {error}");
        }
    }

    match get_sim_contacts().await {
        Ok(contacts) => {
            println!("SIM contacts fetched: {}", contacts.len());
            for contact in contacts.iter().take(10) {
                println!(
                    "- [{}] {} | {}",
                    contact.index,
                    contact.name,
                    contact.number
                );
            }
        }
        Err(error) => {
            eprintln!("SIM contacts fetch failed: {error}");
            std::process::exit(1);
        }
    }
}
