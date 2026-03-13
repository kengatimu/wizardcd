Java 21 setup on the runner vm

1. Add Adoptium repository
	sudo apt update
	sudo apt install -y wget apt-transport-https gpg

	wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
  | sudo gpg --dearmor -o /usr/share/keyrings/adoptium.gpg
  
    echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb jammy main" \
  | sudo tee /etc/apt/sources.list.d/adoptium.list
 
 2. Install Java 21
	sudo apt update
	sudo apt install temurin-21-jdk
	
3. Export java 21 to path
	- Edit:
		nano ~/.bashrc
	
	-  Add at the bottom:
		export JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64
		export PATH=$JAVA_HOME/bin:$PATH
	
	- Then reload:
		source ~/.bashrc
		
4. Verify
	java -version
	javac -version
	echo $JAVA_HOME