import { Input, Output, ComponentResourceOptions } from "@pulumi/pulumi";
import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure";
import * as random from "@pulumi/random";
import * as types from "./types";

export interface AzureNetworkArgs extends types.NetworkArgs {
    resourceGroupName: Input<string>;
};

export interface AzureWebServerArgs extends types.WebServerArgs {
    resourceGroupName: Input<string>;
};

export class Network extends types.Network {
    public readonly network: azure.network.VirtualNetwork;
    public readonly publicSubnets: azure.network.Subnet[];

    constructor(name: string, args: AzureNetworkArgs, opts?: ComponentResourceOptions) {
        super("custom:AzureNetwork", name, args, opts);

        // Create a network
        this.network = new azure.network.VirtualNetwork(`${name}-vnet`, {
            resourceGroupName: args.resourceGroupName,
            addressSpaces: [args.vpcCidrBlock],
            tags: args.tags,
        }, { parent: this });

        // Create subnets
        this.publicSubnets = [];
        for (let i = 0; i < (args.publicSubnetCidrBlocks?.length ?? 0); i++) {
            const subnet = new azure.network.Subnet(`${name}-subnet-${i}`, {
                resourceGroupName: args.resourceGroupName,
                virtualNetworkName: this.network.name,
                addressPrefixes: [args.publicSubnetCidrBlocks[i]],
            }, { parent: this.network });
            this.publicSubnets.push(subnet);
        }

        this.registerOutputs({});
    }

    public getNetworkId(): Output<string> {
        return this.network.id;
    }
    public getPublicSubnetIds(): Output<string>[] {
        return this.publicSubnets.map(it => it.id);
    }
}
export class WebServer extends types.WebServer {
    public readonly publicIp: azure.network.PublicIp;
    public readonly virtualMachine: azure.compute.VirtualMachine;

    constructor(name: string, args: AzureWebServerArgs, opts?: ComponentResourceOptions) {
        super("custom:AzureWebServer", name, args, opts);

        // Create a Public IP and security group resources
        const webSg = new azure.network.NetworkSecurityGroup(`${name}-nsg`, {
            resourceGroupName: args.resourceGroupName,
            tags: args.tags,
        });

        const webSgHttp = new azure.network.NetworkSecurityRule(`${name}-http`, {
            resourceGroupName: args.resourceGroupName,
            networkSecurityGroupName: webSg.name,
            priority: 100,
            direction: "Inbound",
            access: "Allow",
            protocol: "Tcp",
            sourceAddressPrefix: "*",
            sourcePortRange: "*",
            destinationAddressPrefix: "*",
            destinationPortRange: "80",
        }, { parent: webSg });

        this.publicIp = new azure.network.PublicIp(`${name}-ip`, {
            resourceGroupName: args.resourceGroupName,
            allocationMethod: "Dynamic",
            tags: args.tags,
        });

        const networkInterface = new azure.network.NetworkInterface(`${name}-nic`, {
            resourceGroupName: args.resourceGroupName,
            ipConfigurations: [{
                name: `${name}-nic-ipcfg`,
                subnetId: args.subnetId,
                publicIpAddressId: this.publicIp.id,
                privateIpAddressAllocation: "Dynamic",
            }],
            tags: args.tags,
        }, { parent: this.publicIp });

        const networkInterfaceSGAssociation = new azure.network.NetworkInterfaceSecurityGroupAssociation(`${name}-nic-nsg`, {
            networkInterfaceId: networkInterface.id,
            networkSecurityGroupId: webSg.id,
        }, { parent: networkInterface });

        const randomPassword = new random.RandomPassword("pwd", {
            length: 20,
            special: true,
        }, { parent: this });

        const userName = "pulumi-admin";
        const vmName = `${name}-vm`;
        this.virtualMachine = new azure.compute.VirtualMachine(vmName, {
            resourceGroupName: args.resourceGroupName,
            networkInterfaceIds: [networkInterface.id], // reference the networkInterface created above
            vmSize: "Standard_A0",
            deleteDataDisksOnTermination: true,
            deleteOsDiskOnTermination: true,
            osProfile: {
                computerName: "hostname",
                adminUsername: userName, // reference the userName variable
                adminPassword: randomPassword.result,
            },
            osProfileLinuxConfig: {
                disablePasswordAuthentication: false,
            },
            storageOsDisk: {
                createOption: "FromImage",
                name: vmName,
            },
            storageImageReference: {
                publisher: "canonical",
                offer: "UbuntuServer",
                sku: "16.04-LTS",
                version: "latest",
            },
            tags: { ...args.tags, Name: vmName, },
        }, { parent: networkInterface });

        this.registerOutputs();
    }

    public getInstanceId(): Output<string> {
        return this.virtualMachine.id;
    }
    public getInstanceAddress(): pulumi.Output<string> {
        // The public IP address is not allocated until the VM is running, so wait for that
        // resource to create, and then lookup the IP address again to report its public IP.
        const ready = pulumi.all({ _: this.virtualMachine.id, name: this.publicIp.name, resourceGroupName: this.publicIp.resourceGroupName });
        return ready.apply(d =>
            azure.network.getPublicIP({
                name: d.name,
                resourceGroupName: d.resourceGroupName,
            }, { async: true }).then(ip => ip.ipAddress)
        );
    }
}
