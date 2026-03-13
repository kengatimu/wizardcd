====================================
Runner setup - Normal Linux Vms
====================================

1. Generate the SSH key on your MacBook/ Machine
	ssh-keygen -t ed25519 \
	  -f ~/.ssh/id_ed25519_wizardcd_runner_vm \
	  -C "wizardcd-runner@macbook" \
	  -N ""

- Set correct permissions:
	chmod 600 ~/.ssh/id_ed25519_wizardcd_runner_vm
	chmod 644 ~/.ssh/id_ed25519_wizardcd_runner_vm.pub
	
2. Copy the public key to the VM
- At this point you need one-time password access to the VM. Use ssh-copy-id:
	ssh-copy-id -i ~/.ssh/id_ed25519_wizardcd_runner_vm.pub <admin-user>@192.168.56.9
	ssh-copy-id -i ~/.ssh/id_ed25519_wizardcd_runner_vm.pub vagrant@192.168.56.9
	
- Verify it works without a password:
	ssh -i ~/.ssh/id_ed25519_wizardcd_runner_vm <admin-user>@192.168.56.9 "echo connected"

3. Add an SSH config entry (so you never need to type -i again)
	cat >> ~/.ssh/config <<'EOF'

	Host wizardcd-runner
	  HostName 192.168.56.9
	  User deploy
	  IdentityFile ~/.ssh/id_ed25519_wizardcd_runner_vm
	  IdentitiesOnly yes
EOF

- Update permission:
	chmod 600 ~/.ssh/config
	
- Note: After the deploy user is created in Step 6, you can simply use ssh wizardcd-runner for everything.

4. SSH into the VM as your admin user
	ssh -i ~/.ssh/id_ed25519_wizardcd_runner_vm <admin-user>@192.168.56.9
	
5. Create the deploy user
	sudo adduser --disabled-password --gecos "" deploy

6. Grant deploy the necessary permissions
	# Add to sudo group
	sudo usermod -aG sudo deploy

	# Passwordless sudo for service management only
	sudo tee /etc/sudoers.d/wizardcd-runner > /dev/null <<'EOF'
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl start wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl stop wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl status wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl enable wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
	deploy ALL=(ALL) NOPASSWD: /bin/tee /etc/systemd/system/wizardcd-runner.service
	deploy ALL=(ALL) NOPASSWD: /bin/journalctl
EOF

	ssh wizardcd-runner "sudo chmod 440 /etc/sudoers.d/wizardcd-runner"
	
7. Set up SSH access for deploy
	sudo mkdir -p /home/deploy/.ssh
	sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
	sudo chown -R deploy:deploy /home/deploy/.ssh
	sudo chmod 700 /home/deploy/.ssh
	sudo chmod 600 /home/deploy/.ssh/authorized_keys
	
- This copies the current user authorized keys to the deploy user
- Meaning anyone who could SSH as the current user can now SSH as deploy using the same keys.
	
8. Exit the VM — all remaining steps run from your MacBook:
	exit
	
- Verify the deploy user now works with your key:
	ssh wizardcd-runner "echo SSH as deploy OK"
	
	
====================================
Runner setup - Vagrant Vms
====================================

1. Generate the SSH key on your MacBook
	ssh-keygen -t ed25519 \
	  -f ~/.ssh/id_ed25519_wizardcd_runner_vm \
	  -C "wizardcd-runner@macbook" \
	  -N ""

	chmod 600 ~/.ssh/id_ed25519_wizardcd_runner_vm
	chmod 644 ~/.ssh/id_ed25519_wizardcd_runner_vm.pub
	
2. Inject your public key into the Vagrant VM
- cd into your Vagrantfile directory first, then use vagrant ssh to append the key — this bypasses the password auth problem entirely:
	
	cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/Vagrant/Ubuntu/wizardcd-runner-vm
	vagrant ssh -- "mkdir -p ~/.ssh && \
	  echo '$(cat ~/.ssh/id_ed25519_wizardcd_runner_vm.pub)' >> ~/.ssh/authorized_keys && \
	  chmod 700 ~/.ssh && \
	  chmod 600 ~/.ssh/authorized_keys"

- Verify it works:
ssh -i ~/.ssh/id_ed25519_wizardcd_runner_vm vagrant@192.168.56.9 "echo SSH key auth OK"

3. Add SSH config entry on your MacBook
	cat >> ~/.ssh/config <<'EOF'

	# WizardCD Runner VM (Vagrant)
	Host wizardcd-runner
	  HostName 192.168.56.9
	  User deploy
	  IdentityFile ~/.ssh/id_ed25519_wizardcd_runner_vm
	  IdentitiesOnly yes

	Host wizardcd-runner-vagrant
	  HostName 192.168.56.9
	  User vagrant
	  IdentityFile ~/.ssh/id_ed25519_wizardcd_runner_vm
	  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config

- Two entries — wizardcd-runner-vagrant for the admin/setup steps (vagrant user), wizardcd-runner for all deployment steps (deploy user, configured below).

- Verify the vagrant alias works:
	ssh wizardcd-runner-vagrant "echo connected as vagrant"
	
4. Create the deploy user
	ssh wizardcd-runner-vagrant \
	  "sudo adduser --disabled-password --gecos '' deploy"

5. Grant deploy the necessary permissions
	ssh wizardcd-runner-vagrant "sudo usermod -aG sudo deploy"

	ssh wizardcd-runner-vagrant "sudo tee /etc/sudoers.d/wizardcd-runner > /dev/null" <<'EOF'
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl start wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl stop wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl status wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl enable wizardcd-runner
	deploy ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
	deploy ALL=(ALL) NOPASSWD: /bin/tee /etc/systemd/system/wizardcd-runner.service
	deploy ALL=(ALL) NOPASSWD: /bin/journalctl
EOF
	
	ssh wizardcd-runner-vagrant "sudo chmod 440 /etc/sudoers.d/wizardcd-runner"

6. Set up SSH for the deploy user
- Copy your public key into deploy's authorized_keys':
	ssh wizardcd-runner-vagrant \
	  "sudo mkdir -p /home/deploy/.ssh && \
	   sudo cp /home/vagrant/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys && \
	   sudo chown -R deploy:deploy /home/deploy/.ssh && \
	   sudo chmod 700 /home/deploy/.ssh && \
	   sudo chmod 600 /home/deploy/.ssh/authorized_keys"
	   
- Verify the deploy user SSH works:
	ssh wizardcd-runner "echo connected as deploy OK"

- From here on every command uses wizardcd-runner (the deploy user).
