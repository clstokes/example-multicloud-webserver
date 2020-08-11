import * as aws from "./aws";
import * as azure from "./azure";
import { ResourceGroup } from "@pulumi/azure/core";

/**
 * AWS 
 */
const awsNetwork = new aws.Network("aws", {
    vpcCidrBlock: "10.0.0.0/22",
    publicSubnetCidrBlocks: ["10.0.0.0/24", "10.0.1.0/24",]
});
export const awsNetworkId = awsNetwork.getNetworkId();
export const awsPublicSubnetIds = awsNetwork.getPublicSubnetIds();

const awsWebserver = new aws.WebServer("aws", {
    networkId: awsNetworkId,
    subnetId: awsPublicSubnetIds[0],
});
export const awsInstanceId = awsWebserver.getInstanceId();
export const awsInstanceAddress = awsWebserver.getInstanceAddress();

/**
 * Azure 
 */
// All resources will share a resource group.
const resourceGroup = new ResourceGroup("azure");

const azureNetwork = new azure.Network("azure", {
    resourceGroupName: resourceGroup.name,
    vpcCidrBlock: "10.0.0.0/22",
    publicSubnetCidrBlocks: ["10.0.0.0/24", "10.0.1.0/24",]
});
export const azureNetworkId = azureNetwork.getNetworkId();
export const azurePublicSubnetIds = azureNetwork.getPublicSubnetIds();

const azureWebserver = new azure.WebServer("azure", {
    resourceGroupName: resourceGroup.name,
    networkId: azureNetworkId,
    subnetId: azurePublicSubnetIds[0],
});
export const azureInstanceId = azureWebserver.getInstanceId();
export const azureInstanceAddress = azureWebserver.getInstanceAddress();
